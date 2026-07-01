# Restaurant Ordering System

A full-stack web application for managing restaurant orders, customer feedback, and admin operations. Built with Node.js, Express, and PostgreSQL following the MVC architecture pattern.

---

## Features

- **Authentication** — Session-based login and registration with role-based access control (USER / ADMIN)
- **Product Catalogue** — Browse available menu items with details and pricing
- **Order Management** — Place orders, view order history, and cancel pending orders
- **Feedback System** — Submit, edit, and delete feedback per completed order item; respond to feedback
- **Admin Dashboard** — Filter and sort all orders by date, category, status; view revenue and order stats
- **Product Availability** — Admin can toggle products available/unavailable from the dashboard
- **Responsive UI** — Bootstrap 5 interface

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL |
| Authentication | express-session + bcryptjs |
| Frontend | Vanilla JS, Bootstrap 5 |

---

## Project Structure

```
restaurant_ordering_system_student/
├── public/                  # Static frontend files
│   ├── css/style.css
│   ├── js/                  # Frontend JS (dashboard, feedback, orders, etc.)
│   ├── feedback/            # Feedback HTML pages
│   ├── dashboard.html
│   ├── login.html
│   ├── register.html
│   ├── orders.html
│   ├── products.html
│   └── product-detail.html
├── src/
│   ├── config/database.js   # PostgreSQL connection pool
│   ├── controllers/         # Request handlers (auth, order, feedback, dashboard)
│   ├── middleware/auth.js   # Session authentication guards
│   ├── models/              # DB model classes (Member, Product, SaleOrder, Feedback, Response)
│   ├── routes/              # Express routers
│   └── database/            # SQL schema and seed files
├── server.js                # Entry point
├── .env                     # Environment variables
└── package.json
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [PostgreSQL](https://www.postgresql.org/) v14 or higher

---

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Open `.env` and update the values to match your local PostgreSQL setup:

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=restaurant_db
DB_PORT=5432

SESSION_SECRET=your-secret-key-here

PORT=3000
NODE_ENV=development
```

### 3. Set up the database

Open **pgAdmin** or **psql** and run the following steps **in order**:

**Step 1 — Create the database**

```sql
CREATE DATABASE restaurant_db;
```

**Step 2 — Restore the base schema and seed data**

Run the file:
```
src/database/restaurant_db_restore.sql
```

This creates all the base tables (`member`, `member_role`, `product`, `sale_order`, `sale_order_item`) and inserts sample data.

**Step 3 — Create the feedback schema**

Run the file:
```
src/database/feedback_schema.sql
```

This creates the `feedback` and `feedback_response` tables.

**Step 4 — Create all functions and stored procedures**

Run the file:
```
src/database/functions_and_procedures.sql
```

This creates all SQL functions and stored procedures used by the application, including:
- Member: `get_member_by_email`, `register_member`
- Product: `get_products`, `get_product_by_id`, `get_product_categories`, `get_product_by_category`, `update_product_availability`
- Orders: `get_member_orders`, `place_order`, `update_order_status`, `check_order_ownership`, `get_order_by_id`, `get_order_item_status`
- Dashboard: `get_sale_order_summary`
- Feedback: `create_feedback`, `update_feedback`, `delete_feedback`, `get_feedback`, `get_feedback_by_product`, `get_feedback_by_id`, `feedback_exists_for_order_item`
- Responses: `create_response`, `delete_response`, `get_response`, `get_feedback_author_id`

### 5. Start the server

**Development mode** (auto-restarts on file changes):
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server runs on **http://localhost:3000** by default.

---

## Test Credentials

| Role | Email | Password |
|---|---|---|
| Admin | sally@example.com | Password123 |
| User | teddy@example.com | Password123 |

---

## Page Routes

| URL | Description | Access |
|---|---|---|
| `/login` | Login page | Public |
| `/register` | Registration page | Public |
| `/member/products` | Product catalogue | User |
| `/member/product-detail?id=X` | Product detail + order form | User |
| `/orders/my-orders` | View and cancel own orders | User |
| `/feedback/my-feedback` | Manage own feedback | User |
| `/feedback/create` | Write feedback for a completed order | User |
| `/dashboard` | Admin order dashboard | Admin |

---

## API Endpoints

| Method | URL | Description |
|---|---|---|
| POST | `/login` | Login |
| POST | `/register` | Register |
| GET | `/logout` | Logout |
| GET | `/products` | List all products |
| GET | `/products/:id` | Get product by ID |
| GET | `/orders/my` | Get logged-in member's orders |
| POST | `/orders` | Place a new order |
| PUT | `/orders/:id/status` | Update order status |
| GET | `/feedback/my` | Get own feedback |
| POST | `/feedback` | Submit new feedback |
| PUT | `/feedback/:id` | Edit own feedback |
| DELETE | `/feedback/:id` | Delete own feedback |
| GET | `/feedback/:productId/all` | Get all feedback for a product |
| POST | `/feedback/:feedbackId/responses` | Submit a response |
| DELETE | `/feedback/responses/:id` | Delete own response |
| GET | `/api/dashboard` | Admin order summary (filtered) |
| GET | `/api/dashboard/product-feedback` | Feedback for a product category |
| PATCH | `/api/dashboard/product-availability` | Toggle product availability |
| GET | `/api/auth/status` | Check session auth status |
