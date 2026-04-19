# Security Specification for LexiconTrack

## Data Invariants
- A lesson must have an `id`, `nomeDaAula`, and an array of `audios`.
- Audios must have an `id`, `titulo`, and `texto`.
- Every write (create/update) must be performed by an authenticated Admin.

## The "Dirty Dozen" Payloads (Deny cases)
1. **Unauthenticated Write**: Attempting to create a lesson without being logged in.
2. **Identity Spoofing**: Attempting to create an admin document as a non-admin.
3. **Invalid ID**: Attempting to use a 2MB string as a lesson ID.
4. **Shadow Fields**: Adding a `isAdmin: true` field to a lesson document.
5. **Type Poisoning**: Sending a number where a string is expected for `nomeDaAula`.
6. **Status Jump**: (N/A for this app)
7. **Resource Exhaustion**: Sending an array of 50,000 audios in one lesson.
8. **Malicious Transcript**: Sending a 2MB transcript string.
9. **Orphaned Write**: (N/A for single collection pattern)
10. **Query Scraping**: Attempting to list all users (if we had a users collection).
11. **Deleted Admin Lockout**: Trying to update a terminal state after revocation.
12. **PII Leak**: (N/A, currently no PII in lessons).

## Test Runner (Logic Verification)
- `allow read: if true;` (Public access to learning content)
- `allow write: if isAdmin();`
