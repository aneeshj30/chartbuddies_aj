#!/bin/bash
# Setup script for environment variables

echo "🔧 Chartbuddies Environment Setup"
echo ""
echo "This script will help you set up separate databases for development and production."
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local already exists!"
    read -p "Do you want to backup and recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp .env.local .env.local.backup
        echo "✅ Backed up to .env.local.backup"
    else
        echo "Keeping existing .env.local"
        exit 0
    fi
fi

echo ""
echo "📋 Please provide your DEVELOPMENT Supabase credentials:"
echo "   (Get these from: Supabase Dashboard > Settings > API)"
echo ""
read -p "Development Supabase URL: " DEV_URL
read -p "Development Supabase Anon Key: " DEV_KEY

echo ""
echo "Creating .env.local for development..."
cat > .env.local << EOL
# Development Environment Variables
# This file is gitignored - DO NOT commit

NEXT_PUBLIC_SUPABASE_URL=$DEV_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$DEV_KEY
NEXT_PUBLIC_ENV=development
EOL

echo "✅ Created .env.local"
echo ""
echo "📝 Next steps:"
echo "   1. Set PRODUCTION credentials in Vercel Dashboard"
echo "   2. Run migrations on your development database"
echo "   3. See ENVIRONMENT_SETUP.md for detailed instructions"
echo ""
