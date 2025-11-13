# PMS/CRM Integration Layer

The **pmsIntegration** module provides a secure bridge between eDentist.AI and practice-management or CRM systems such as GoHighLevel, Salesforce, and HubSpot.

## Environment requirements

Define the following variables in `.env` (or within your secret manager of choice):

```bash
# GoHighLevel
PMS_GHL_BASE_URL=https://rest.gohighlevel.com/v1
PMS_GHL_API_KEY=ghl_xxx
PMS_GHL_LOCATION_ID=location_xxx
PMS_GHL_CALENDAR_ID=calendar_xxx

# Salesforce
PMS_SALESFORCE_BASE_URL=https://your-instance.my.salesforce.com
PMS_SALESFORCE_TOKEN=00Dxx!AQE...
PMS_SALESFORCE_OWNER_ID=005xx00000123ABC
PMS_SALESFORCE_EVENT_RECORD_TYPE=012xx0000000XYZ

# HubSpot
PMS_HUBSPOT_BASE_URL=https://api.hubapi.com
PMS_HUBSPOT_PRIVATE_APP_TOKEN=pat-eDentist-xxx
PMS_HUBSPOT_PIPELINE_ID=default
PMS_HUBSPOT_STAGE_ID=appointmentscheduled
```

- If any variable is missing, the corresponding provider is automatically disabled.
- Customize request timeouts through `PMS_*_TIMEOUT_MS`.

## Local endpoints

During development (via the CRA proxy) the following endpoints are available:

| Endpoint | Description |
| --- | --- |
| `GET /api/integrations/pms/providers` | List providers and configuration status |
| `POST /api/integrations/pms/:provider/book` | Create a new booking |
| `PATCH /api/integrations/pms/:provider/booking/:id` | Update an existing booking |
| `DELETE /api/integrations/pms/:provider/booking/:id` | Cancel a booking |
| `POST /api/integrations/pms/:provider/performance` | Send performance reports to the external system |

> Sending to `/performance` automatically uses the current analytics report when the payload omits the `report` property.

## Frontend usage

`src/services/pmsIntegration.ts` exposes ready-made helpers:

```ts
import {
  bookAppointment,
  updateAppointment,
  cancelAppointment,
  pushPerformanceReport,
} from "@/services/pmsIntegration";
```

- `ConversationManager` calls these functions to synchronize bookings based on the detected user intent.
- The analytics dashboard can dispatch performance reports directly to the selected PMS.

## Security notes

- Store sensitive keys in a secrets manager or server-side environment variables.
- Outbound requests pass through validation layers that provide detailed error responses without revealing sensitive data.
- Settings can be reloaded without restarts via `pmsIntegration.reload()`.

