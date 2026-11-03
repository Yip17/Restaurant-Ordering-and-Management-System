# Restaurant Ordering System

A full-stack web application for managing restaurant orders, customer feedback, and admin operations. Built with Node.js, Express, and PostgreSQL following the MVC architecture pattern.

---

## Features

- **Authentication** — Session-based login and registration with role-based access control (USER / ADMIN)
- **Product Catalogue** — Browse available menu items with details and pricing
- **Shopping Cart** — Add, update, remove items; persistent cart per member
- **Discount Engine** — Automatic discount calculation with three types:
  - Product quantity discounts (buy X, get % off)
  - Cart value discounts (spend $X, get % off)
  - Delivery tier pricing (spend $X, get reduced/free delivery)
- **Checkout System** — View cart summary, applied discounts, and place orders
- **Order Management** — Place orders via stored procedure with transaction handling; view order history
- **Feedback System** — Submit, edit, and delete feedback per completed order item; respond to feedback
- **Admin Dashboard** — Filter and sort all orders by date, category, status; view revenue and order stats
- **Promotion Management** — Admin can create, edit, delete, and toggle discount rules with duplicate prevention
- **Product Availability** — Admin can toggle products available/unavailable from the dashboard
- **Responsive UI** — Bootstrap 5 interface

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | express-session + bcryptjs |
| Frontend | Vanilla JS, Bootstrap 5 |

---

## Project Structure

```
restaurant_ordering_system_student/
├── prisma/
│   ├── schema.prisma        # Database schema (Prisma ORM)
│   └── migrations/          # Database migration history
├── public/                  # Static frontend files
│   ├── css/style.css
│   ├── js/                  # Frontend JS (cart, checkout, dashboard, feedback, orders, promotions)
│   ├── feedback/            # Feedback HTML pages
│   ├── cart.html
│   ├── checkout.html
│   ├── dashboard.html
│   ├── login.html
│   ├── register.html
│   ├── orders.html
│   ├── products.html
│   ├── product-detail.html
│   └── promotions.html      # Admin promotion management
├── src/
│   ├── config/database.js   # PostgreSQL connection pool
│   ├── controllers/         # Request handlers (cart, checkout, promotion, auth, order, feedback, dashboard)
│   ├── middleware/auth.js   # Session authentication guards
│   ├── models/              # Prisma queries and business logic (Cart, Checkout, DiscountEngine, DiscountRule, etc.)
│   ├── routes/              # Express routers
│   └── database/            # SQL functions and stored procedures
├── server.js                # Entry point
├── .env                     # Environment variables
└── package.json
```

---

## Database Schema

### Core Tables
- **member** — User accounts (members and admins)
- **member_role** — Role assignments (USER / ADMIN)
- **product** — Menu items with pricing and availability
- **sale_order** — Order records with status tracking
- **sale_order_item** — Line items per order
- **cart** — Shopping cart (one per member)
- **cart_item** — Items in each cart
- **discount_rule** — Promotion rules with three types
- **feedback** — Customer feedback on completed order items
- **feedback_response** — Admin/member responses to feedback

### Key Relationships
- `member` (1) → (N) `cart`, `sale_order`, `feedback`, `discount_rule`
- `product` (1) → (N) `cart_item`, `sale_order_item`, `discount_rule`
- `cart` (1) → (N) `cart_item`
- `sale_order` (1) → (N) `sale_order_item`
- `sale_order_item` (1) → (1) `feedback`
- `feedback` (1) → (N) `feedback_response`

### Discount System
The `discount_rule` table supports three discount types:

1. **QUANTITY_PRODUCT** — Product-level discount
   - Requires: `product_id`, `threshold_value` (min qty), `discount_percent`
   - Example: Buy 3+ pizzas, get 10% off each

2. **CART_VALUE** — Cart subtotal discount
   - Requires: `threshold_value` (min $), `discount_percent`
   - Example: Spend $50+, get 15% off cart

3. **DELIVERY_TIERED** — Delivery fee by order value
   - Requires: `threshold_value` (min $), `delivery_fee`
   - Example: Spend $30+, delivery is $3 (or $0 for free)

Each discount rule can track which admin (`created_by`) created or last modified it.

---

## Key Features

### Place Orders with Transaction Handling
The `place_orders` stored procedure processes cart items with **per-item subtransactions**:
- **Available items** → Create order, create order item, remove from cart
- **Unavailable items** → Skip without rollback, continue processing
- Discounts are calculated on available items only before order creation

### Discount Engine
The `DiscountEngine` model automatically:
- Evaluates all active discount rules
- Applies product quantity discounts per item
- Applies cart value discount on eligible subtotal
- Calculates delivery fee based on tiered rules
- Returns detailed breakdown with applied rules

### Admin Promotion Management
Admins can create/edit/delete discount rules with validation:
- Duplicate prevention for same product, cart threshold, or delivery tier
- Active/inactive toggle without deletion
- Real-time discount preview on checkout page

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
- Orders: `get_member_orders`, `place_order`, `place_orders` (transaction-based cart processing), `update_order_status`, `check_order_ownership`, `get_order_by_id`, `get_order_item_status`
- Dashboard: `get_sale_order_summary`
- Feedback: `create_feedback`, `update_feedback`, `delete_feedback`, `get_feedback`, `get_feedback_by_product`, `get_feedback_by_id`, `feedback_exists_for_order_item`
- Responses: `create_response`, `delete_response`, `get_response`, `get_feedback_author_id`

**Step 5 — Run Prisma migrations**

```bash
npx prisma migrate dev
```

This syncs the Prisma schema with your database and generates the Prisma Client.

### 6. Start the server

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
| `/member/product-detail?id=X` | Product detail + add to cart | User |
| `/member/cart` | View and manage shopping cart | User |
| `/member/checkout` | Checkout with discount summary | User |
| `/orders/my-orders` | View order history | User |
| `/feedback/my-feedback` | Manage own feedback | User |
| `/feedback/create` | Write feedback for a completed order | User |
| `/dashboard` | Admin order dashboard | Admin |
| `/admin/promotions` | Manage discount rules | Admin |

---

## API Endpoints

### Authentication
| Method | URL | Description |
|---|---|---|
| POST | `/login` | Login |
| POST | `/register` | Register |
| GET | `/logout` | Logout |
| GET | `/api/auth/status` | Check session auth status |

### Products
| Method | URL | Description |
|---|---|---|
| GET | `/products` | List all products |
| GET | `/products/:id` | Get product by ID |

### Cart
| Method | URL | Description |
|---|---|---|
| POST | `/api/cart/items` | Add item to cart |
| GET | `/api/cart/items` | Get cart items with product details |
| PUT | `/api/cart/items/:itemId` | Update cart item quantity |
| DELETE | `/api/cart/items/:itemId` | Remove item from cart |
| DELETE | `/api/cart` | Clear entire cart |
| GET | `/api/cart/summary` | Get cart summary |

### Checkout & Orders
| Method | URL | Description |
|---|---|---|
| GET | `/api/checkout/summary` | Get checkout summary with discounts |
| GET | `/api/checkout/available-discounts` | Get active promotion rules |
| POST | `/api/checkout/place-orders` | Place orders via stored procedure |
| GET | `/orders/my` | Get logged-in member's orders |
| PUT | `/orders/:id/status` | Update order status |

### Promotions (Admin)
| Method | URL | Description |
|---|---|---|
| GET | `/api/promotions` | List all discount rules |
| GET | `/api/promotions/products` | List all products for discount setup |
| POST | `/api/promotions` | Create new discount rule |
| PUT | `/api/promotions/:id` | Update discount rule |
| DELETE | `/api/promotions/:id` | Delete discount rule |

### Feedback
| Method | URL | Description |
|---|---|---|
| GET | `/feedback/my` | Get own feedback |
| POST | `/feedback` | Submit new feedback |
| PUT | `/feedback/:id` | Edit own feedback |
| DELETE | `/feedback/:id` | Delete own feedback |
| GET | `/feedback/:productId/all` | Get all feedback for a product |
| POST | `/feedback/:feedbackId/responses` | Submit a response |
| DELETE | `/feedback/responses/:id` | Delete own response |

### Dashboard (Admin)
| Method | URL | Description |
|---|---|---|
| GET | `/api/dashboard` | Admin order summary (filtered) |
| GET | `/api/dashboard/product-feedback` | Feedback for a product category |
| PATCH | `/api/dashboard/product-availability` | Toggle product availability |
