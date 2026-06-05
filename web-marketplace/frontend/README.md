# PDS Marketplace - Local Demo

This is a working demo of the PDS Marketplace frontend. It showcases the user interface that will be built for the just-in-time manufacturing platform.

## Quick Start

### Start the Frontend Server

```powershell
cd frontend
node server.js
```

Then open your browser to: **http://localhost:8080**

### What You'll See

The frontend demonstrates:

- **🏪 Marketplace View**: Browse sellers and manufacturers with ratings and reviews
- **🗺️ Map View**: Interactive map showing designer/producer locations across the USA
- **📍 Geolocation**: Location-based discovery with distance calculations
- **⭐ Business Profiles**: Detailed information about each designer/producer
- **🤝 Just-In-Time Workflow**: How orders go from placement to manufacturing to delivery
- **🔔 Bid System Explanation**: How manufacturers compete for orders

## Features in This Demo

### Sellers & Manufacturers
- Vermont Artisan Woodworks (Custom furniture)
- Texas Machine Works (Metal machining)
- California Textile Design (Custom apparel)
- Ohio Metal Fabrication (Metal work)
- North Carolina Printing Co (Printing services)
- Portland Craft Brewery Equipment (Specialized manufacturing)

### Map Integration
- Interactive Leaflet.js map
- Business location pins
- Pop-up information cards
- Distance and lead time display

### Business Details
- Ratings and review counts
- Product/service categories
- Lead time information
- Business descriptions
- Contact options

## Backend Integration (When Ready)

Once the backend API is available with PostgreSQL:

1. Remove mock data from `app.js`
2. Add API calls to fetch real designers/producers
3. Implement real order placement
4. Connect authentication system
5. Add real payment processing

## File Structure

```
frontend/
├── index.html       # Main HTML structure
├── styles.css       # All styling (Tailwind-like with custom CSS)
├── app.js          # JavaScript logic & mock data
├── server.js       # Simple Node.js HTTP server
└── README.md       # This file
```

## Browser Compatibility

- Chrome/Edge (Latest)
- Firefox (Latest)
- Safari (Latest)
- Mobile browsers

## Next Steps

When the backend is ready:

```bash
# Start both frontend and backend
# Terminal 1:
cd frontend
node server.js

# Terminal 2:
cd api
npm start
```

Then update the API endpoints in `app.js` from mock data to real API calls.

## Styling Notes

The UI uses a custom CSS framework designed for:
- Modern, clean interface
- Accessibility (WCAG compliant)
- Mobile responsiveness
- Fast performance (no heavy frameworks)
- Easy customization

## Demo Data

All business locations and information are fictional but realistic examples of:
- Individual sellers and crafters
- Small manufacturers capable of JIT production
- Geographically dispersed across the USA
- Various production capabilities and lead times

---

**Status**: Frontend Demo ✅ | Backend Ready ✅ | Database Awaiting PostgreSQL ⏳

Once PostgreSQL is set up, the full platform will be operational!
