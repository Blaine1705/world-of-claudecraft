package com.worldofclaudecraft

import android.content.Context
import android.net.Uri
import android.os.Build
import android.util.Base64
import com.funkatronics.encoders.Base58
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "NativeSolanaMobile")
class NativeSolanaMobilePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var activityResultSender: ActivityResultSender
    private val walletAdapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse("https://worldofclaudecraft.com"),
            iconUri = Uri.parse("favicon.svg"),
            identityName = "World of ClaudeCraft",
        ),
    )

    override fun load() {
        super.load()
        activityResultSender = ActivityResultSender(activity)
        walletAdapter.authToken = authPreferences().getString(AUTH_TOKEN_KEY, null)
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val result = JSObject()
        result.put("distribution", BuildConfig.SOLANA_MOBILE_DISTRIBUTION)
        result.put("device", if (isSeeker()) "seeker" else "other")
        result.put("mwaAvailable", solanaMobileAllowed())
        call.resolve(result)
    }

    @PluginMethod
    fun current(call: PluginCall) {
        val address = if (solanaMobileAllowed()) {
            authPreferences().getString(WALLET_ADDRESS_KEY, null)
        } else {
            null
        }
        call.resolve(JSObject().put("address", address))
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        if (!requireSolanaMobile(call)) return
        scope.launch {
            when (val result = walletAdapter.connect(activityResultSender)) {
                is TransactionResult.Success -> {
                    persistAuthToken()
                    val account = result.authResult.accounts.firstOrNull()
                    if (account == null) {
                        call.reject("Wallet returned no account", "MWA_NO_ACCOUNT")
                        return@launch
                    }
                    val address = Base58.encodeToString(account.publicKey)
                    authPreferences().edit().putString(WALLET_ADDRESS_KEY, address).apply()
                    call.resolve(JSObject().put("address", address))
                }
                is TransactionResult.NoWalletFound ->
                    call.reject("No Mobile Wallet Adapter wallet found", "MWA_NO_WALLET")
                is TransactionResult.Failure ->
                    call.reject("Wallet connection failed", "MWA_CONNECT_FAILED", result.e)
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        if (!requireSolanaMobile(call)) return
        scope.launch {
            when (val result = walletAdapter.disconnect(activityResultSender)) {
                is TransactionResult.Success -> {
                    walletAdapter.authToken = null
                    authPreferences().edit().remove(AUTH_TOKEN_KEY).remove(WALLET_ADDRESS_KEY).apply()
                    call.resolve()
                }
                is TransactionResult.NoWalletFound -> {
                    walletAdapter.authToken = null
                    authPreferences().edit().remove(AUTH_TOKEN_KEY).remove(WALLET_ADDRESS_KEY).apply()
                    call.resolve()
                }
                is TransactionResult.Failure ->
                    call.reject("Wallet disconnect failed", "MWA_DISCONNECT_FAILED", result.e)
            }
        }
    }

    @PluginMethod
    fun signMessage(call: PluginCall) {
        if (!requireSolanaMobile(call)) return
        val message = call.getString("message")
        if (message.isNullOrEmpty()) {
            call.reject("Missing message", "MWA_MISSING_MESSAGE")
            return
        }
        scope.launch {
            val result = walletAdapter.transact(activityResultSender) { authResult ->
                signMessagesDetached(
                    arrayOf(message.toByteArray(Charsets.UTF_8)),
                    arrayOf(authResult.accounts.first().publicKey),
                )
            }
            when (result) {
                is TransactionResult.Success -> {
                    persistAuthToken()
                    val signature = result.payload
                        .messages
                        ?.firstOrNull()
                        ?.signatures
                        ?.firstOrNull()
                    if (signature == null) {
                        call.reject("Wallet returned no signature", "MWA_NO_SIGNATURE")
                        return@launch
                    }
                    call.resolve(JSObject().put("signature", Base58.encodeToString(signature)))
                }
                is TransactionResult.NoWalletFound ->
                    call.reject("No Mobile Wallet Adapter wallet found", "MWA_NO_WALLET")
                is TransactionResult.Failure ->
                    call.reject("Message signing failed", "MWA_SIGN_FAILED", result.e)
            }
        }
    }

    @PluginMethod
    fun signAndSendTransaction(call: PluginCall) {
        if (!requireSolanaMobile(call)) return
        val encoded = call.getString("transaction")
        if (encoded.isNullOrEmpty()) {
            call.reject("Missing transaction", "MWA_MISSING_TRANSACTION")
            return
        }
        val transaction = try {
            Base64.decode(encoded, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            call.reject("Invalid transaction encoding", "MWA_INVALID_TRANSACTION", error)
            return
        }
        scope.launch {
            val result = walletAdapter.transact(activityResultSender) {
                signAndSendTransactions(arrayOf(transaction))
            }
            when (result) {
                is TransactionResult.Success -> {
                    persistAuthToken()
                    val signature = result.payload.signatures.firstOrNull()
                    if (signature == null) {
                        call.reject("Wallet returned no transaction signature", "MWA_NO_SIGNATURE")
                        return@launch
                    }
                    call.resolve(JSObject().put("signature", Base58.encodeToString(signature)))
                }
                is TransactionResult.NoWalletFound ->
                    call.reject("No Mobile Wallet Adapter wallet found", "MWA_NO_WALLET")
                is TransactionResult.Failure ->
                    call.reject("Transaction signing failed", "MWA_TRANSACTION_FAILED", result.e)
            }
        }
    }

    private fun persistAuthToken() {
        val token = walletAdapter.authToken
        if (token.isNullOrEmpty()) {
            authPreferences().edit().remove(AUTH_TOKEN_KEY).apply()
        } else {
            authPreferences().edit().putString(AUTH_TOKEN_KEY, token).apply()
        }
    }

    private fun authPreferences() =
        context.getSharedPreferences(AUTH_PREFERENCES_NAME, Context.MODE_PRIVATE)

    private fun requireSolanaMobile(call: PluginCall): Boolean {
        if (solanaMobileAllowed()) return true
        call.reject("Solana Mobile is unavailable for this build or device", "MWA_UNAVAILABLE")
        return false
    }

    private fun solanaMobileAllowed(): Boolean =
        BuildConfig.SOLANA_MOBILE_DISTRIBUTION == "solana-dapp-store" && isSeeker()

    private fun isSeeker(): Boolean =
        Build.MODEL.equals("Seeker", ignoreCase = true) &&
            Build.BRAND.equals("solanamobile", ignoreCase = true) &&
            Build.MANUFACTURER.equals("Solana Mobile Inc.", ignoreCase = true)

    companion object {
        private const val AUTH_PREFERENCES_NAME = "solana_mobile"
        private const val AUTH_TOKEN_KEY = "solana_mobile_auth_token"
        private const val WALLET_ADDRESS_KEY = "solana_mobile_wallet_address"
    }
}
