# Job-board company logo

The job-board row uses one shared `CompanyLogo` component on both the regular and remote boards. It is a 48px square mark using the standard small radius, line border, and card surface. The component requests a company mark from Logo.dev by company name. An image error, an absent publishable key, or an unknown company displays a quiet two-letter initial mark in the same geometry. The mark is decorative because the company name remains present in the row’s metadata.

Logo.dev is loaded directly by the browser with its publishable token. The token is set as `NEXT_PUBLIC_LOGO_DEV_TOKEN` in the root `.env` and passed into the frontend container by Docker Compose.

The job-board header includes the Logo.dev attribution required by its free commercial plan.
