# Local Testing Guide

## The Problem

When opening HTML files directly (`file://` protocol), browsers block:
- Cross-origin requests
- Some JavaScript modules
- Web fonts from different paths
- Background images via CSS

**Error examples:**
```
Not allowed to load local resource: file:///...
```

## The Solution: Run a Local Web Server

### Option 1: Use the Startup Script (Easiest)

```bash
./start-local-server.sh
```

Then open: http://localhost:8000/ui/index.html

### Option 2: Manual Python Server

```bash
# Python 3
python3 -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

### Option 3: Node.js Server

```bash
# Install globally (once)
npm install -g http-server

# Run
http-server -p 8000
```

### Option 4: VS Code Live Server

1. Install "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

## What Was Fixed

✅ Background image path updated in CSS
✅ All file references use camelCase
✅ Favicon added
✅ Font paths corrected

## Testing Checklist

After starting the server, test:

- [ ] Main landing page loads
- [ ] Monthly budget page works
- [ ] Messenger page loads (check for crypto errors)
- [ ] Background image displays
- [ ] Font Awesome icons show
- [ ] Navigation between pages works

## Notes

- **NEVER** use browser flags to disable security (unsafe!)
- Always test with a local server for accurate results
- The app requires a server for full functionality
