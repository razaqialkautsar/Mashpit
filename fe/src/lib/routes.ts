// Dashboard routes. The landing page owns "/", so the Live page from
// docs/FRONTEND_SPEC.md moves to "/live". Change them here only.
export const routes = {
  live: "/live",
  job: "/job",
  newJob: "/new",
  keepers: "/keepers",
} as const;

// Static export: job ids travel in the query string, not the path (FRONTEND_SPEC §3.1).
export const jobHref = (id: number) => `${routes.job}?id=${id}`;
