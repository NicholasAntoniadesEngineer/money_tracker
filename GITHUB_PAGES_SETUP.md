# GitHub Pages Deployment Guide

## ✅ Yes, it will work on GitHub Pages!

The application is fully compatible with GitHub Pages because:
- ✅ All code runs client-side (browser)
- ✅ Supabase handles CORS automatically
- ✅ All file paths are relative (work on any domain)
- ✅ No server-side processing needed

## Setup Steps

### 1. Update Supabase RLS Policies (IMPORTANT!)

Since GitHub Pages has no authentication, you need to allow public access:

1. Go to your Supabase project: https://supabase.com/dashboard/project/ofutzrxfbrgtbkyafndv
2. Navigate to **SQL Editor**
3. Run this SQL to update the policies for public access:

```sql
-- Drop existing authenticated-only policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON months;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON pots;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON settings;

-- Create public access policies
CREATE POLICY "Allow public access" ON months
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON pots
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON settings
    FOR ALL USING (true) WITH CHECK (true);
```

**⚠️ Security Note**: These policies allow anyone to read/write your data. For production, consider:
- Adding authentication (Supabase Auth)
- Using more restrictive policies
- Or keeping it private if it's personal use only

### 2. Enable GitHub Pages

**Option A: Using GitHub Actions (Recommended)**
1. The `.github/workflows/deploy.yml` file is already created
2. Go to your repository **Settings** → **Pages**
3. Under "Source", select **GitHub Actions**
4. Push to `main` or `master` branch - it will auto-deploy

**Option B: Using Branch/Path**
1. Go to repository **Settings** → **Pages**
2. Under "Source", select **Deploy from a branch**
3. Choose branch: `main` or `master`
4. Choose folder: `/ (root)`
5. Click **Save**

### 3. Verify Deployment

After deployment:
1. Your site will be available at: `https://[username].github.io/money_tracker/`
2. Or if using custom domain: your custom domain
3. Test that:
   - Pages load correctly
   - Supabase connection works
   - Data can be saved/loaded

## File Structure for GitHub Pages

The `.nojekyll` file ensures GitHub Pages serves all files correctly:
- Prevents Jekyll processing (which can break relative paths)
- Ensures all files are served as static assets

## Troubleshooting

### Issue: "Failed to fetch" or CORS errors
**Solution**: Check Supabase RLS policies are set to allow public access (see step 1)

### Issue: 404 errors for JavaScript files
**Solution**: 
- Verify `.nojekyll` file exists in root
- Check file paths are relative (they are)
- Clear browser cache

### Issue: Database connection fails
**Solution**:
- Verify Supabase project URL and API key in `database/config/supabase-config.js`
- Check browser console for specific error messages
- Verify RLS policies allow public access

## Security Considerations

Since this uses public RLS policies:
- ⚠️ **Anyone with your GitHub Pages URL can access your data**
- ⚠️ **Anyone can modify your data**
- ✅ **Solution**: Add Supabase Authentication for production use

To add authentication later:
1. Enable Supabase Auth
2. Update RLS policies to require authentication
3. Add login UI to your application

## Testing Locally Before Deploying

Test that everything works locally first:

```bash
# Install dependencies (if needed)
npm install

# Start local server
npm start

# Or use any static server
npx http-server . -p 8080
```

Then test:
- ✅ All pages load
- ✅ Database operations work
- ✅ No console errors

## Custom Domain (Optional)

If you want a custom domain:
1. Add `CNAME` file in root with your domain
2. Configure DNS records as per GitHub Pages instructions
3. Update Supabase CORS settings if needed (usually not required)

