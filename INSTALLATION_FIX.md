# Installation Fix for lightgbm Error

## Problem
`lightgbm` installation is failing because the required `libomp` (OpenMP) library is missing, and Homebrew has permission issues.

## Solution

### Step 1: Fix Homebrew Permissions

Run this command in your terminal:

```bash
sudo chown -R $(whoami) /opt/homebrew /Users/ali/Library/Logs/Homebrew
```

This will reset the ownership of Homebrew directories to your user account.

### Step 2: Install libomp

After fixing permissions, install the OpenMP library:

```bash
brew install libomp
```

### Step 3: Install Python Dependencies

Now you can install the requirements:

```bash
pip3 install -r requirements.txt
```

---

## Alternative: Install Without lightgbm

If you want to skip the `lightgbm` issue for now (it's only needed for advanced model training), you can install the essential dependencies for the web platform modernization:

```bash
pip3 install openai>=1.0.0 apscheduler>=3.10.0 pillow>=10.0.0
```

Then verify the new modules work:

```bash
python3 -c "from app.image_generation import generate_slider_images_batch; from app.scheduler import start_scheduler; print('✓ Modernization modules ready')"
```

---

## What You Need for Web Platform

The web platform modernization primarily needs these new packages:

1. **openai** - For DALL-E 3 slider image generation
2. **apscheduler** - For scheduled daily content generation
3. **pillow** - For image processing

The existing dependencies (FastAPI, SQLAlchemy, etc.) are already installed and working.

---

## Quick Verification

After installing openai, apscheduler, and pillow, verify:

```bash
# Check OpenAI
python3 -c "import openai; print('OpenAI version:', openai.__version__)"

# Check APScheduler
python3 -c "import apscheduler; print('APScheduler version:', apscheduler.__version__)"

# Check Pillow
python3 -c "from PIL import Image; print('Pillow available')"
```

---

## Start Development

Once the essential packages are installed:

### Terminal 1 - Backend
```bash
export OPENAI_API_KEY="sk-your-key-here"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Terminal 2 - Frontend
```bash
cd web
npm run dev
```

Access: http://localhost:3001

---

## Full Installation (Recommended Later)

For production or full features, you'll want all dependencies including `lightgbm`. Once Homebrew permissions are fixed:

```bash
# Install libomp
brew install libomp

# Install all Python packages
pip3 install -r requirements.txt

# Verify everything
python3 -c "import lightgbm; print('LightGBM version:', lightgbm.__version__)"
```

---

**Note:** The web modernization features (theme toggle, language switcher, chat sidebar, DALL-E integration) will work with just openai, apscheduler, and pillow. The existing ML models and simulation features require the full dependencies.
