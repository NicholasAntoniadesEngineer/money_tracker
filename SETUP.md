# Money Tracker - Setup Instructions

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Supabase Database**
   - Go to your Supabase project dashboard: https://supabase.com/dashboard/project/ofutzrxfbrgtbkyafndv
   - Navigate to SQL Editor
   - Run the SQL from `database/utils/schema.sql` to create tables

3. **Start the Application**
   ```bash
   npm start
   ```
   Or use any static file server pointing to the project root.

## Project Structure

```
money_tracker/
├── ui/                    # UI/Presentation Layer
│   ├── views/            # HTML pages
│   ├── components/       # UI components
│   ├── controllers/      # Page controllers
│   ├── services/         # UI services
│   ├── utils/            # UI utilities
│   └── styles/           # CSS stylesheets
│
├── database/              # Database Layer
│   ├── config/           # Supabase configuration
│   ├── services/         # Database service layer
│   ├── models/           # Data models
│   └── utils/            # Database utilities & schema
│
└── index.html            # Root redirect to ui/index.html
```

## Database Configuration

The Supabase configuration is already set in `database/config/supabase-config.js`:
- **Project URL**: `https://ofutzrxfbrgtbkyafndv.supabase.co`
- **API Key**: `sb_publishable_yUPqP6PRjtgphcvS0--vgw_Zy3S_Urd`

## Database Schema

Run the SQL schema from `database/utils/schema.sql` in your Supabase SQL Editor to create:
- `months` table - Stores monthly budget data
- `pots` table - Stores pots/investments
- `settings` table - Stores application settings

## Production Checklist

- [x] Supabase database schema created
- [x] All file paths updated to new structure
- [x] Database service layer implemented
- [x] All controllers updated to use async database methods
- [x] Error handling implemented
- [x] Old files removed
- [ ] Database RLS policies configured (adjust as needed)
- [ ] Test data migration if needed (see `database/utils/migration-guide.md`)

## Notes

- All data operations are now async and use Supabase
- The application loads Supabase client library from CDN
- Row Level Security (RLS) is enabled - adjust policies in Supabase dashboard as needed
- No localStorage or file-based storage is used anymore

