# CHEN read-only Worker version verification

Date: 2026-11-13.
Inspect only the existing Worker version list and active deployment.
The previous upload command reported an upload then failed at a
separate Workers subdomain API call (HTTP authentication code 10000).
No additional upload, deploy, delete, or configuration change is authorized.
