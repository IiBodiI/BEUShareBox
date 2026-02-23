# BEUShareBox

BEUShareBox is a classroom Single Page Application (SPA) for sharing products, built with pure HTML5, CSS3, and Vanilla JavaScript.

Users can add products, like, comment, filter, search, sort, and manage data with localStorage.

## Demo Features

- Add products dynamically from a form
- Auto-fill product fields from pasted product links
- Auto-detect category from product content signals
- Like products with live counters
- Comment system per product
- Category filter, search, and sorting (price, likes, newest)
- Delete products with confirmation
- Drag and drop product reordering
- Product detail modal (ESC to close)
- User profile (username and avatar URL)
- My Products filter
- Dark/Light theme toggle (stored in localStorage)
- Import/Export JSON data
- Toast notifications
- Statistics dashboard:
  - Total products
  - Total likes
  - Most liked product
  - Category distribution
- Responsive modern UI with gradients and animations

## Tech Stack

- HTML5 (semantic and accessible structure)
- CSS3 (custom properties, responsive layout, animations)
- Vanilla JavaScript (DOM manipulation, event delegation, modular functions)
- Browser APIs:
  - localStorage
  - Drag and Drop API
  - FileReader
  - Blob/download APIs
  - fetch

No frameworks or UI libraries are used.

## Project Structure

```text
.
|- index.html
|- styles.css
`- app.js
```

## Data Model

Products are stored as an array of objects:

```js
{
  id,
  title,
  description,
  price,
  category,
  likes,
  comments: [],
  createdAt
}
```

Current implementation also stores:

- ownerUsername
- sourceUrl
- imageBase64 (or image URL fallback)

## Run Locally

### Option 1: Open directly

Open `index.html` in your browser.

### Option 2: Local server (recommended)

```bash
python -m http.server 5500
```

Then open:

`http://localhost:5500`

## Usage

1. Set your profile (username and optional avatar URL).
2. Paste a product link in Product Source Link to auto-fill fields.
3. Review/edit title, description, price, category, and image.
4. Click Add Product.
5. Use filter/search/sort toolbar to browse products.
6. Like, comment, delete, or drag-and-drop reorder cards.
7. Export data as JSON or import and merge existing JSON.

## Storage Keys

- `beusharebox.products.v1`
- `beusharebox.profile.v1`
- `beusharebox.theme.v1`

## Architecture Notes

- Event delegation is used for card actions (like/delete/comment/open).
- Rendering logic and state updates are separated into dedicated functions.
- Form validation is applied before state updates.
- UI updates are re-rendered from state after each action.

## Link Auto-Fill Notes

Auto-fill tries multiple metadata strategies (HTML metadata, structured data, and fallback sources) to fetch:

- title
- description
- price
- image
- category

Some websites heavily block scraping or hotlinking. In those cases, behavior may vary depending on source protections.

## License

This project is for educational/classroom use.
