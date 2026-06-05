# PySimpleGUI Installation Guide

## Issue

PySimpleGUI moved to a private PyPI server. The old version doesn't have the `theme()` function.

## Solution

### Option 1: Use launch_gui.bat (Easiest - Windows)

```cmd
launch_gui.bat
```

This batch file automatically:
- Uninstalls old PySimpleGUI
- Installs latest from private server
- Launches the GUI

### Option 2: Manual Installation (Any OS)

**Step 1: Uninstall old version**
```bash
python -m pip uninstall PySimpleGUI -y
python -m pip cache purge
```

**Step 2: Install from private server**
```bash
python -m pip install --upgrade --extra-index-url https://PySimpleGUI.net/install PySimpleGUI
```

**Step 3: Launch GUI**
```bash
python go_gui.py
```

### Option 3: Force Reinstall (If Step 2 doesn't work)

```bash
python -m pip install --force-reinstall --extra-index-url https://PySimpleGUI.net/install PySimpleGUI
```

## Verification

To verify PySimpleGUI is correctly installed:

```bash
python -c "import PySimpleGUI as sg; sg.theme('DarkBlue3'); print('✅ PySimpleGUI is working!')"
```

If you see "✅ PySimpleGUI is working!" then you're ready to launch the GUI.

## Troubleshooting

### "AttributeError: module 'PySimpleGUI' has no attribute 'theme'"

**Solution**: You have the old version. Follow "Option 2: Manual Installation" above.

### "Failed to fetch from PySimpleGUI.net"

**Solution**: 
1. Check your internet connection
2. Try the force reinstall option:
   ```bash
   python -m pip install --force-reinstall --extra-index-url https://PySimpleGUI.net/install PySimpleGUI
   ```

### "pip: command not found"

**Solution**: Use `python -m pip` instead of just `pip`:
```bash
python -m pip install --extra-index-url https://PySimpleGUI.net/install PySimpleGUI
```

## Next Steps

Once installation is complete:

1. **Launch GUI**:
   ```bash
   python go_gui.py
   ```

2. **Or use batch launcher** (Windows):
   ```cmd
   launch_gui.bat
   ```

3. **Build firmware**:
   - Select Platform (left column)
   - Select Hardware Revision (middle column)
   - Select Device Role (right column)
   - Click "🔨 COMPILE"
   - Watch the terminal output

---

**Last Updated**: February 1, 2026  
**Status**: ✅ Installation Guide Complete
