# Git Setup Instructions - Pinleaf Forge

## ? Project Prepared for Git

### What's Been Done:

1. ? **Created `.gitignore`**
   - Excludes `.vs/`, `.old/`, temp files
   - Follows best practices

2. ? **Moved deprecated files to `.old/`**
   - `ai-backend.py` ? No longer needed (pure client-side now)
   - `platform-editor-v2 - Copy.html` ? Old backup
   - `ENHANCEMENT-PLAN.md` ? Completed features

3. ? **Updated documentation**
   - `README.md` ? Complete user guide with Pinleaf Forge branding
   - `AI-INSTRUCT.md` ? Updated authority document
   - `LICENSE` ? MIT license added

4. ? **Git initialized**
   - Repository ready in `K:\PDS_AutomationSuite\PDS-HwPlatform`

5. ? **Branding updates**
   - Project renamed to **Pinleaf Forge**
   - Fixed column widths for better alignment
   - Added comprehensive synopsis

---

## ?? Next Steps - Run These Commands:

### 1. Stage All Files
```bash
git add .
```

### 2. Initial Commit
```bash
git commit -m "Initial commit: Pinleaf Forge v2.1

- Open-source embedded platform specification editor
- AI-assisted data population via Copilot/ChatGPT prompts
- Visual pin capability matrix with drag & drop
- Multi-header support (J1, J2, J3...)
- Color-coded capability buttons with gradients
- Fixed column widths for alignment
- Structured JSON export/import
- No backend required (pure client-side)
"
```

### 3. Create GitHub Repository
1. Go to https://github.com/new
2. Repository name: `PinleafForge` or `pinleaf-forge`
3. Description: `? Open-source embedded platform specification editor - Define MCU/processor specs with AI assistance and visual pin matrix`
4. Public or Private: **Your choice**
5. **DO NOT** initialize with README (we already have one)
6. Click **Create repository**

### 4. Connect and Push
```bash
# Copy the remote URL from GitHub (looks like: https://github.com/username/pinleaf-forge.git)

git remote add origin <YOUR_GITHUB_URL>
git branch -M main
git push -u origin main
```

---

## ?? Project Structure (What's Being Committed)

```
PinleafForge/  (or pinleaf-forge/)
??? .gitignore                    ? Excludes .vs/, .old/, temp files
??? LICENSE                       ? MIT license
??? README.md                     ? User documentation
??? AI-INSTRUCT.md               ? Authority document
??? GIT-SETUP.md                 ? This file
??? HEADER-ID-FEATURE.md         ? Multi-header support docs
??? platform-editor-v2.html      ? Main platform editor (? Pinleaf Forge)
??? pinout-leaf-generator.html   ? Visual pinout generator
?
??? platforms/                   ? Platform definitions (if any exist)
??? hwrev/                       ? Board definitions (if any exist)
??? .old/                        ? Excluded by .gitignore
    ??? ai-backend.py
    ??? platform-editor-v2 - Copy.html
    ??? ENHANCEMENT-PLAN.md
```

---

## ?? What's Changed from v1.0

### Removed ?
- Backend server (`ai-backend.py`)
- API dependencies
- Server setup complexity

### Added ?
- Pure client-side operation
- AI research prompt generation for Copilot Chat
- Group column for pin organization
- Multi-column sorting
- Gradient color power pins (VIN, 5V, 3V3)
- Drag & drop pin reordering
- Comprehensive documentation

### Improved ?
- Simpler deployment (just open HTML file)
- Works offline
- No installation required
- Better pin capability visualization

---

## ?? Commit Message Template (For Future Changes)

### Features
```bash
git commit -m "feat: Add new capability button for CAN bus"
```

### Fixes
```bash
git commit -m "fix: Correct 5V button color gradient"
```

### Documentation
```bash
git commit -m "docs: Update README with new sorting features"
```

### Platform Additions
```bash
git commit -m "docs: Add STM32F407 platform specification"
```

---

## ?? Recommended GitHub Settings

After pushing, configure these settings on GitHub:

1. **Description**: 
   ```
   ? Pinleaf Forge - Open-source embedded platform specification editor with AI assistance and visual pin matrix
   ```

2. **Website** (optional):
   ```
   https://yourusername.github.io/pinleaf-forge
   ```
   (if you set up GitHub Pages)

3. **Topics** (tags):
   ```
   embedded hardware microcontroller esp32 platform-editor automation iot pinout stm32 arduino raspberry-pi mcu specifications datasheet
   ```

4. **Branch Protection** (Settings ? Branches):
   - Protect `main` branch
   - Require pull request reviews (optional)

5. **README Badge** (add to README.md):
   ```markdown
   [![GitHub Stars](https://img.shields.io/github/stars/username/pinleaf-forge?style=social)](https://github.com/username/pinleaf-forge)
   ```

6. **GitHub Pages** (Settings ? Pages):
   - Source: `main` branch
   - Folder: `/` (root)
   - This will publish your editor at: `https://username.github.io/pinleaf-forge/platform-editor-v2.html`

---

## ? Ready to Push!

Your project is now clean, documented, and ready for Git! ??

Run the commands above to push to GitHub.
