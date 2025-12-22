# Money Tracker

A comprehensive financial tracking application with Supabase database integration.

## Structure

The application is organized into two main layers:

### UI Layer (`ui/`)
- **views/**: HTML pages (index.html, monthly-budget.html, pots.html, settings.html)
- **components/**: Reusable UI components (Header.js)
- **controllers/**: Page controllers (LandingController.js, MonthlyBudgetController.js, etc.)
- **services/**: UI services (CalculationService.js, FormHandler.js, TableRenderer.js, ExportService.js)
- **utils/**: UI utilities (formatters.js, CSVHandler.js, ReferenceImporter.js)
- **styles/**: CSS stylesheets organized by component and view

### Database Layer (`database/`)
- **config/**: Supabase configuration (supabase-config.js)
- **services/**: Database service layer (database-service.js)
- **models/**: Data models (data-manager.js, month-factory.js)
- **utils/**: Database utilities (schema.sql)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL schema from `database/utils/schema.sql` to create the necessary tables

### 3. Configure Supabase

The Supabase configuration is already set in `database/config/supabase-config.js` with:
- Project URL: `https://ofutzrxfbrgtbkyafndv.supabase.co`
- Publishable API Key: `sb_publishable_yUPqP6PRjtgphcvS0--vgw_Zy3S_Urd`

### 4. Run the Application

```bash
npm start
```

Or use any static file server:

```bash
npx http-server . -p 8080
```

## Database Schema

The application uses three main tables:

1. **months**: Stores monthly budget data
2. **pots**: Stores pots/investments data
3. **settings**: Stores application settings

See `database/utils/schema.sql` for the complete schema definition.

## Features

- Monthly budget tracking
- Income and expense management
- Variable and fixed costs tracking
- Pots and investments tracking
- Financial overview and trends
- Export functionality (JSON, CSV, HTML)

## Production Notes

- All data is stored in Supabase PostgreSQL database
- Row Level Security (RLS) is enabled - adjust policies as needed
- The application uses Supabase client library loaded from CDN
- All database operations are async and use proper error handling

## GitHub Pages Deployment

✅ **Yes, this works on GitHub Pages!**

See `GITHUB_PAGES_SETUP.md` for complete deployment instructions.

**Quick steps:**
1. Update Supabase RLS policies to allow public access (run `database/utils/schema-public-access.sql`)
2. Enable GitHub Pages in repository settings
3. Deploy using GitHub Actions (workflow already configured)

**Important**: For GitHub Pages, you need public RLS policies since there's no authentication. See `GITHUB_PAGES_SETUP.md` for details.

