# Chartbuddies Setup Instructions

## Database Setup

1. **Run the database migrations in Supabase SQL Editor (in order):**

   - `supabase-migrations/001_create_admissions_table.sql` (if not already done)
   
   - `supabase-migrations/002_complete_schema.sql` which contains:
     - Complete database schema for hospitals, users, patients, MAR forms
     - Row Level Security (RLS) policies
     - Triggers for auto-updating timestamps
     - Function to auto-create user profiles on signup
   
   - `supabase-migrations/011_add_mar_tracking_fields.sql` which adds:
     - Blood pressure tracking fields (systolic, diastolic) to vital signs
     - Bowel movement tracking field
     - Custom instructions field for vital signs (e.g., "BP (sprinkle salt on food if BP low <80/60)")

2. **Environment Variables:**
   
   **For Local Development:**
   Create a `.env.local` file in the project root with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_development_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_development_anon_key
   NEXT_PUBLIC_ENV=development
   ```
   
   **For Production (Vercel):**
   Set these in Vercel Dashboard > Settings > Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_production_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
   NEXT_PUBLIC_ENV=production
   ```
   
   ⚠️ **Important:** Use separate Supabase projects for development and production!
   See `ENVIRONMENT_SETUP.md` for detailed setup instructions.

## Features Implemented

✅ **Authentication System**
- Login page (`/auth/login`)
- Signup page (`/auth/signup`) - Supports creating new hospital or joining with invite code
- Protected routes with role-based access
- Auto-logout functionality

✅ **Patient Management**
- Patient registration form (`/admissions`) with all required fields
- Dashboard showing assigned patients (`/dashboard`)
- Patient forms page showing available forms per patient (`/patients/[id]/forms`)

✅ **MAR Form System**
- New MAR form creation (`/patients/[id]/mar/new`)
  - Patient information section
  - Medications with 31-day administration grid (PRN option hidden but recoverable)
  - PRN/Not Administered records section (separate from main medication grid)
  - Enhanced vital signs section with:
    - Blood pressure tracking (Systolic, Diastolic)
    - Pulse, Temperature, Respiration, Weight
    - Bowel movement tracking
    - Custom instructions field (e.g., "BP (sprinkle salt on food if BP low <80/60)")
  - Save as draft or submit functionality
- View/Edit MAR form (`/patients/[id]/mar/[marId]`)
  - Two-page layout (Medications & Vital Signs/PRN)
  - Edit mode for updating administrations and vital signs
  - All new tracking fields available

✅ **Database Schema**
- Multi-tenant hospital isolation
- Role-based access control (Superadmin, Head Nurse, Nurse)
- Complete MAR form data structure
- Audit logging table (ready for future use)

## User Flow

1. **First Time User (Superadmin):**
   - Sign up → Create new hospital → Automatically becomes Superadmin
   - Can register patients and see all hospital data

2. **Nurse Signing Up:**
   - Sign up with invite code → Joins existing hospital as Nurse
   - Can only see assigned patients

3. **Nurse Workflow:**
   - Login → Dashboard shows assigned patients
   - Click patient → See available forms (MAR, etc.)
   - Create/edit MAR forms for assigned patients

## Next Steps (Future Enhancements)

- [x] MAR form view/edit page (to view/continue editing existing forms) ✅
- [ ] Head Nurse/Superadmin dashboard with hospital management
- [ ] Nurse-patient assignment interface
- [ ] Form builder for custom forms
- [ ] Audit log viewing
- [ ] Reports and analytics
- [ ] Separate vital signs sheet (for comprehensive VS tracking)

## Notes

- The first person to sign up for a hospital automatically becomes the Superadmin
- Nurses auto-assign patients they create to themselves
- All RLS policies are in place for data isolation
- MAR forms support draft and submitted statuses

