// Classifies a THROWN database error by what it proves about the transaction
// it interrupted. Deliberately dependency-free (it only reads err.code), so
// the service layer can consult it for compensation decisions without
// importing the pg-backed db module (whose load reads DATABASE_URL).
//
// A statement-level SQLSTATE (a constraint violation, a statement_timeout
// cancel, a data fault) aborts the whole transaction before COMMIT, so a
// compensating restore is safe. A connection-class failure (08xxx, the
// 57P01/57P02 shutdowns) or a driver-side error with no SQLSTATE at all (a
// query_timeout, a socket reset) can arrive AFTER a COMMIT reached the
// server, so nothing is proven: compensating there can duplicate the work
// the transaction already committed.
export function throwProvedRollback(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return false;
  return !code.startsWith('08') && code !== '57P01' && code !== '57P02';
}
