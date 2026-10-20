let shopWhatsAppNumber = "";

async function loadProductsHeroBackground() {
    try {
        const response = await fetch("/api/config");
        const data = await response.json();
        shopWhatsAppNumber = String(data.whatsapp || "").replace(/\D/g, "");

        const hero = document.querySelector(".products-hero");

        if (
            hero &&
            data.settings &&
            data.settings.products_hero_background
        ) {
            hero.style.backgroundImage =
                `url("${data.settings.products_hero_background}")`;
        }

    } catch (error) {
        console.error(
            "Could not load Products hero background:",
            error
        );
    }
}
const defaultProducts = [{
        id: 1,
        name: "Matte Hair Clay",
        category: "Styling",
        price: 180,
        description: "Strong flexible hold with a clean matte finish.",
        image: "/products/conditioner.svg"
    },
    {
        id: 2,
        name: "Premium Hair Pomade",
        category: "Styling",
        price: 190,
        description: "Smooth styling with shine and dependable all-day hold.",
        image: "/products/pomade.svg"
    },
    {
        id: 3,
        name: "Moisturising Shampoo",
        category: "Hair Care",
        price: 160,
        description: "Gentle cleansing shampoo designed for regular use.",
        image: "/products/shampoo.svg"
    },
    {
        id: 4,
        name: "Hydrating Conditioner",
        category: "Hair Care",
        price: 160,
        description: "Helps keep hair soft, manageable and moisturised.",
        image: "/products/conditioner.svg"
    },
    {
        id: 5,
        name: "Beard Oil",
        category: "Beard Care",
        price: 150,
        description: "Lightweight beard oil for a conditioned, groomed finish.",
        image: "/products/beard-oil.svg"
    },
    {
        id: 6,
        name: "Beard Balm",
        category: "Beard Care",
        price: 170,
        description: "Condition and lightly style your beard while keeping it neat.",
        image: "/products/beard-balm.svg"
    }
];
let products = defaultProducts;

const productsGrid = document.getElementById("productsGrid");
const productFilters = document.getElementById("productFilters");

let categories = [
    "All",
    ...new Set(products.map(product => product.category))
];

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function renderFilters() {
    productFilters.innerHTML = categories
        .map((category, index) => `
            <button
                class="product-filter ${index === 0 ? "active" : ""}"
                data-category="${escapeHtml(category)}"
            >
                ${category}
            </button>
        `)
        .join("");

    document
        .querySelectorAll(".product-filter")
        .forEach(button => {
            button.addEventListener("click", () => {
                document
                    .querySelectorAll(".product-filter")
                    .forEach(item => item.classList.remove("active"));

                button.classList.add("active");

                renderProducts(button.dataset.category);
            });
        });
}

function renderProducts(category = "All") {
    const filteredProducts =
        category === "All" ?
        products :
        products.filter(product => product.category === category);

    if (!filteredProducts.length) {
        productsGrid.innerHTML = `
            <div class="no-products">
                No products are currently available.
            </div>
        `;

        return;
    }

    productsGrid.innerHTML = filteredProducts
        .map(product => `
            <article class="product-card">

                <div class="product-image">

                    <img
                        src="${escapeHtml(product.image || "/products/matte-clay.svg")}"
                        alt="${escapeHtml(product.name)}"
                    >

                    <span class="product-category">
                        ${escapeHtml(product.category)}
                    </span>

                </div>

                <div class="product-info">

                    <h2>${escapeHtml(product.name)}</h2>

                    <p class="product-description">
                        ${escapeHtml(product.description)}
                    </p>

                    <div class="product-bottom">

                        <span class="product-price">
                            R${escapeHtml(product.price)}
                        </span>

                        <a
                            href="${createOrderWhatsAppUrl(product)}"
                            class="product-button"
                            target="_blank"
                            rel="noopener"
                        >
                            Add to Order
                        </a>

                    </div>

                </div>

            </article>
        `)
        .join("");
}

function createOrderWhatsAppUrl(product) {
    const message = [
        "Hi! I'd like to place an order:",
        `Product: ${product.name}`,
        "Quantity: 1",
        `Price: R${product.price}`,
        "Please confirm availability and collection or delivery details."
    ].join("\n");
    return `https://wa.me/${shopWhatsAppNumber}?text=${encodeURIComponent(message)}`;
}

async function initProductsPage() {
    await loadProductsHeroBackground();
    try {
        const response = await fetch("/api/products");
        if (!response.ok) throw new Error("Could not load products.");
        const items = await response.json();
        if (items.length) {
            products = items.map(product => ({ ...product, image: product.image_url }));
        }
    } catch (error) {
        console.error(error);
    }

    categories = ["All", ...new Set(products.map(product => product.category))];
    renderFilters();
    renderProducts();
}

initProductsPage();
