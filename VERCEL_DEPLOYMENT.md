# Deploy to Vercel Guide

This guide will help you deploy your GPS Navigation App with Bluetooth support to Vercel.

## Prerequisites

1. **GitHub Account** (or GitLab/Bitbucket)
2. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
3. **Google Maps API Key** - For the navigation features

## Method 1: Deploy via Vercel Dashboard (Recommended)

### Step 1: Push Your Code to GitHub

1. Initialize git repository (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit - GPS Navigation with Bluetooth"
   ```

2. Create a new repository on GitHub:
   - Go to [github.com](https://github.com) and create a new repository
   - Don't initialize with README, .gitignore, or license

3. Push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Import Project to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Vercel will auto-detect it's a Vite project

### Step 3: Configure Build Settings

Vercel should auto-detect these settings, but verify:

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 4: Add Environment Variables

1. In the Vercel project settings, go to **Settings → Environment Variables**
2. Add your Google Maps API key:
   - **Name**: `VITE_GOOGLE_MAPS_API_KEY`
   - **Value**: Your actual Google Maps API key
   - **Environment**: Production, Preview, Development (select all)

3. Click **"Save"**

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait for the build to complete (usually 1-2 minutes)
3. Your app will be live at `https://your-project-name.vercel.app`

## Method 2: Deploy via Vercel CLI

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

From your project directory:

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? (Select your account)
- Link to existing project? **No**
- Project name? (Enter a name or press Enter for default)
- Directory? (Press Enter for current directory)
- Override settings? **No**

### Step 4: Add Environment Variables

```bash
vercel env add VITE_GOOGLE_MAPS_API_KEY
```

Enter your API key when prompted. Repeat for production:
```bash
vercel env add VITE_GOOGLE_MAPS_API_KEY production
```

### Step 5: Deploy to Production

```bash
vercel --prod
```

## Important Notes for Bluetooth

### HTTPS Requirement

- **Web Bluetooth API requires HTTPS** (or localhost)
- Vercel automatically provides HTTPS for all deployments
- Your app will work with Bluetooth on the deployed version

### Browser Compatibility

Web Bluetooth is supported in:
- ✅ Chrome (Desktop & Android)
- ✅ Edge (Desktop)
- ✅ Opera (Desktop)
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

### CORS and API Keys

1. **Google Maps API Key Restrictions**:
   - In Google Cloud Console, add your Vercel domain to allowed referrers:
     - `https://your-project.vercel.app/*`
     - `https://*.vercel.app/*` (for preview deployments)

2. **API Key Security**:
   - Never commit API keys to git
   - Always use environment variables
   - Restrict API keys in Google Cloud Console

## Updating Your Deployment

### Automatic Deployments

- Every push to `main` branch = Production deployment
- Every push to other branches = Preview deployment
- Pull requests = Preview deployment

### Manual Deployment

```bash
vercel --prod
```

## Custom Domain (Optional)

1. Go to your project on Vercel dashboard
2. Click **Settings → Domains**
3. Add your custom domain
4. Follow DNS configuration instructions
5. Update Google Maps API key restrictions to include your domain

## Troubleshooting

### Build Fails

- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify `vercel.json` configuration

### Bluetooth Not Working

- Ensure you're using HTTPS (Vercel provides this automatically)
- Check browser compatibility (Chrome/Edge/Opera only)
- Verify Bluetooth is enabled on your device

### Maps Not Loading

- Check environment variable is set correctly
- Verify API key restrictions allow your Vercel domain
- Check browser console for errors
kkkkkkk
### 404 Errors on Refresh

- The `vercel.json` rewrite rules should handle this
- If issues persist, check the rewrite configuration

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key | Yes |

## Project Structure

```
.
├── vercel.json          # Vercel configuration
├── .vercelignore        # Files to ignore in deployment
├── package.json         # Dependencies and scripts
├── vite.config.ts       # Vite configuration
├── index.html           # Entry HTML file
└── src/                 # Source code
    ├── components/      # React components
    ├── services/        # Bluetooth service
    └── ...
```

## Support

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev)
- **Web Bluetooth API**: [web.dev/bluetooth](https://web.dev/bluetooth)

---

Your app is now live! 🚀


