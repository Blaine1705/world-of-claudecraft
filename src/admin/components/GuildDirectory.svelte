<script lang="ts">
  import { onMount } from 'svelte';
  import type { GuildSummary, Paginated } from '../types';
  import { apiGet } from '../api';
  import { auth } from '../state/auth.svelte';
  import { SEARCH_DEBOUNCE_MS } from '../state/poll';
  import { fmtDate, fmtNumber } from '../format';
  import { t } from '../i18n';
  import GuildLink from './GuildLink.svelte';
  import Pager from './Pager.svelte';
  import Panel from './Panel.svelte';

  type GuildSort = 'name' | 'created_at' | 'member_count';

  let guilds = $state<Paginated<GuildSummary> | null>(null);
  let failed = $state(false);
  let search = $state('');
  let page = $state(1);
  let sort = $state<GuildSort>('name');
  let dir = $state<'asc' | 'desc'>('asc');
  let loading = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let requestEpoch = 0;

  async function refresh(): Promise<void> {
    const epoch = ++requestEpoch;
    loading = true;
    try {
      const params = new URLSearchParams({ page: String(page), search, sort, dir });
      const next = await apiGet<Paginated<GuildSummary>>(`/admin/api/guilds?${params}`);
      if (epoch !== requestEpoch) return;
      guilds = next;
      failed = false;
    } catch (err) {
      if (epoch === requestEpoch && !auth.handleAuthFailure(err)) failed = true;
    } finally {
      if (epoch === requestEpoch) loading = false;
    }
  }

  function onSearchInput(event: Event): void {
    search = (event.currentTarget as HTMLInputElement).value.trim();
    page = 1;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void refresh(), SEARCH_DEBOUNCE_MS);
  }

  function changeSort(column: GuildSort): void {
    dir = sort === column ? (dir === 'desc' ? 'asc' : 'desc') : column === 'name' ? 'asc' : 'desc';
    sort = column;
    page = 1;
    void refresh();
  }

  function sortArrow(column: GuildSort): string {
    if (sort !== column) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  function ariaSort(column: GuildSort): 'ascending' | 'descending' | 'none' {
    if (sort !== column) return 'none';
    return dir === 'asc' ? 'ascending' : 'descending';
  }

  onMount(() => {
    void refresh();
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });
</script>

<div aria-busy={loading}>
<Panel>
  <div class="controls">
    <input
      id="guild-search"
      aria-label={t('guilds.searchLabel')}
      placeholder={t('guilds.searchPlaceholder')}
      value={search}
      oninput={onSearchInput}
    />
    {#if guilds}
      <div class="pager">
        <Pager
          total={guilds.total}
          page={guilds.page}
          limit={guilds.limit}
          onPage={(nextPage) => {
            page = nextPage;
            void refresh();
          }}
        />
      </div>
    {/if}
  </div>

  {#if failed}
    <div class="empty">{t('guilds.loadFailed')}</div>
  {:else if guilds && guilds.rows.length === 0}
    <div class="empty">{t('guilds.empty')}</div>
  {:else if guilds}
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="num">{t('guilds.colId')}</th>
            <th class="sortable" aria-sort={ariaSort('name')}>
              <button type="button" disabled={loading} onclick={() => changeSort('name')}>
                {t('guilds.colName')}<span aria-hidden="true">{sortArrow('name')}</span>
              </button>
            </th>
            <th>{t('guilds.colRealm')}</th>
            <th>{t('guilds.colLeader')}</th>
            <th class="num sortable" aria-sort={ariaSort('member_count')}>
              <button type="button" disabled={loading} onclick={() => changeSort('member_count')}>
                {t('guilds.colMembers')}<span aria-hidden="true">{sortArrow('member_count')}</span>
              </button>
            </th>
            <th class="sortable" aria-sort={ariaSort('created_at')}>
              <button type="button" disabled={loading} onclick={() => changeSort('created_at')}>
                {t('guilds.colCreated')}<span aria-hidden="true">{sortArrow('created_at')}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each guilds.rows as guild (guild.id)}
            <tr>
              <td class="num">{fmtNumber(guild.id)}</td>
              <td><GuildLink guildId={guild.id} label={guild.name} /></td>
              <td>{guild.realm}</td>
              <td>{guild.leaderName ?? t('common.emptyValue')}</td>
              <td class="num">{fmtNumber(guild.memberCount)}</td>
              <td>{fmtDate(guild.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <Pager
      total={guilds.total}
      page={guilds.page}
      limit={guilds.limit}
      layout="footer"
      onPage={(nextPage) => {
        page = nextPage;
        void refresh();
      }}
    />
  {/if}
</Panel>
</div>

<style>
  th.sortable button {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }

  th.sortable button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }

  th.sortable button:disabled {
    cursor: wait;
  }
</style>
