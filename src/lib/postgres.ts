// Options for every connection to PostgreSQL: the app's, the seed's and the
// end-to-end tests'. The Prisma adapter sends instants as UTC wall-clock
// times without an offset, and PostgreSQL reads those in the session's time
// zone, so on a server set to London time they would be stored an hour off
// all summer, which raw SQL and anyone reading the database would see.
// Fixing each session to UTC keeps them right whatever the server's setting.
export const SESSION_OPTIONS = "-c TimeZone=UTC";
