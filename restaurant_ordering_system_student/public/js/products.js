// public/js/products.js
// Drives products.html — member product listing

document.addEventListener('DOMContentLoaded', () => {
  fetchMethod('/products', (status, data) => {
    const tbody      = document.getElementById('product-table-body');
    const noProducts = document.getElementById('no-products');

    tbody.innerHTML = '';

    if (!data.success || data.products.length === 0) {
      noProducts.style.display = 'block';
      return;
    }

    data.products.forEach(product => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${product.name}</td>
        <td>${product.description || '-'}</td>
        <td>${product.category || '-'}</td>
        <td>${parseFloat(product.price).toFixed(2)}</td>
        <td>
          <span class="badge ${product.is_available ? 'bg-success' : 'bg-secondary'}">
            ${product.is_available ? 'Available' : 'Unavailable'}
          </span>
        </td>
        <td>${new Date(product.created_at).toLocaleDateString()}</td>
        <td>
          <a href="/member/product-detail?id=${product.product_id}" class="btn btn-primary btn-sm">
            View Details
          </a>
        </td>`;
      tbody.appendChild(row);
    });
  });
});
