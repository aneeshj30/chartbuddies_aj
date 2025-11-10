# Environment Setup Guide

This guide helps you set up separate databases for development and production.

## Current Setup

You're currently using the same Supabase database for both local development and production. This guide will help you set up separate environments.

## Step 1: Create a Development Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Name it something like "Chartbuddies Dev" or "Chartbuddies Local"
4. Choose a region close to you
5. Set a database password (save this!)
6. Wait for the project to be created

## Step 2: Run Migrations on Development Database

1. In your new development project, go to SQL Editor
2. Run these migrations in order:
   - `supabase-migrations/001_create_admissions_table.sql`
   - `supabase-migrations/002_complete_schema.sql`
   - `supabase-migrations/011_add_mar_tracking_fields.sql`
   - `supabase-migrations/012_fix_missing_hospital_id.sql` (if needed)
   - `supabase-migrations/013_fix_patients_rls_policy.sql`

## Step 3: Set Up Local Environment Variables

1. Get your development project credentials:
   - Go to Settings > API in your development project
   - Copy the "Project URL" and "anon public" key

2. Create/update `.env.local` file in your project root:
   ```bash
   # Development Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-dev-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-dev-anon-key-here
   NEXT_PUBLIC_ENV=development
   ```

## Step 4: Set Up Production Environment Variables (Vercel)

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings > Environment Variables
4. Add these variables (use your PRODUCTION Supabase credentials):
   - `NEXT_PUBLIC_SUPABASE_URL` = Your production Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your production Supabase anon key
   - `NEXT_PUBLIC_ENV` = `production`

5. Make sure these are set for:
   - ✅ Production
   - ✅ Preview (optional)
   - ✅ Development (optional, but recommended)

## Step 5: Verify Your Setup

### Local Development:
```bash
npm run dev
```
- Check that it connects to your development database
- Test creating a user/patient in development
- Verify it doesn't affect production data

### Production:
- Deploy to Vercel
- Verify it uses production database
- Test that production data is separate

## Environment File Structure

```
.env.local                    # Local development (gitignored)
.env.production               # Production template (optional)
.env.local.example            # Example file (committed)
```

## Important Notes

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Production credentials** should be set in Vercel, not in code
3. **Test migrations** on development database first
4. **Backup production** before running migrations there

## Troubleshooting

### Local still using production database?
- Check that `.env.local` exists and has correct values
- Restart your dev server: `npm run dev`
- Clear Next.js cache: `rm -rf .next`

### Production using wrong database?
- Check Vercel environment variables
- Redeploy after updating variables
- Check build logs in Vercel

## Migration Strategy

When you have new migrations:

1. **Test on Development:**
   - Run migration in development Supabase SQL Editor
   - Test the feature locally
   - Verify everything works

2. **Apply to Production:**
   - Run the same migration in production Supabase SQL Editor
   - Test on production
   - Monitor for issues

## Quick Reference

| Environment | Database | Where to Set |
|------------|----------|--------------|
| Local Dev | Development Supabase | `.env.local` file |
| Production | Production Supabase | Vercel Dashboard |

