# Social analytics setup

The dashboard reads social metrics from official platform APIs. A public
website URL is not enough to access follower or channel data. Until authorized
API access is configured, the dashboard shows **Setup required** and names the
missing environment variables instead of inventing metrics.

Add the relevant values to the local `.env` file. Do not commit tokens or keys.
Restart the server after updating the environment.

| Platform | Required environment variables | Access needed |
| --- | --- | --- |
| YouTube | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | Enable YouTube Data API v3 in Google Cloud. Use and appropriately restrict a server-side API key. |
| Instagram | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` | A Meta developer app and an Instagram Business or Creator account connected to a Facebook Page, with required Instagram Graph API permissions. |
| Facebook | `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID` | A Meta app, a Page Access Token authorized by a Page administrator, and permissions for the requested Page fields. |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_ID` | A LinkedIn app with required Marketing API access and authorization from an organization administrator. |

The dashboard displays only fields returned by the configured API and
permitted by the granted access. Missing fields are not represented as zero.
LinkedIn follower analytics may require additional product access and
permissions beyond basic organization details. An API error or expired token
is reported as an API error, not as a successful metrics result.
