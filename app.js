const listings = [
  {
    title: "One-bedroom apartment in the absolute center of Sandanski",
    price: "130 000 €",
    area: "55 m2",
    id: "№ 987",
    category: "Apartment",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2026/06/987-main-1-510x680.jpg",
    href: "https://makler-realty.com/en/listing/%d0%b4%d0%b2%d1%83%d1%81%d1%82%d0%b0%d0%b5%d0%bd-%d0%b0%d0%bf%d0%b0%d1%80%d1%82%d0%b0%d0%bc%d0%b5%d0%bd%d1%82-%d1%86%d0%b5%d0%bd%d1%82%d1%8a%d1%80-%d1%81%d0%b0%d0%bd%d0%b4%d0%b0%d0%bd%d1%81%d0%ba/"
  },
  {
    title: "Spacious one-bedroom apartment with garage - park area!",
    price: "165 000 €",
    area: "117 m2",
    id: "№ 944",
    category: "Apartment",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2026/05/944-1-510x680.jpg",
    href: "https://makler-realty.com/en/listing/%d0%bf%d0%b0%d0%bd%d0%be%d1%80%d0%b0%d0%bc%d0%b5%d0%bd-%d0%b4%d0%b2%d1%83%d1%81%d1%82%d0%b0%d0%b5%d0%bd-%d0%b0%d0%bf%d0%b0%d1%80%d1%82%d0%b0%d0%bc%d0%b5%d0%bd%d1%82-%d1%81-%d0%b3%d0%b0%d1%80%d0%b0/"
  },
  {
    title: "Luxury house for sale in Sandanski",
    price: "339 000 €",
    area: "220 m2",
    id: "№ 939",
    category: "House",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2026/03/939-1-680x510.jpg",
    href: "https://makler-realty.com/en/listing/%d0%bf%d1%80%d0%be%d0%b4%d0%b0%d0%b6%d0%b1%d0%b0-%d0%bd%d0%b0-%d0%bb%d1%83%d0%ba%d1%81%d0%be%d0%b7%d0%bd%d0%b0-%d0%ba%d1%8a%d1%89%d0%b0-%d0%b2-%d0%b3%d1%80-%d1%81%d0%b0%d0%bd%d0%b4%d0%b0%d0%bd%d1%81/"
  },
  {
    title: "New one-bedroom apartment in the town of Sandanski - for sale",
    price: "117 000 €",
    area: "63,93 m2",
    id: "№ 938",
    category: "Apartment",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2026/02/ChatGPT-Image-20.05.2026-г.-09_39_24-680x383.png",
    href: "https://makler-realty.com/en/listing/%d0%bd%d0%be%d0%b2-%d0%b4%d0%b2%d1%83%d1%81%d1%82%d0%b0%d0%b5%d0%bd-%d0%b0%d0%bf%d0%b0%d1%80%d1%82%d0%b0%d0%bc%d0%b5%d0%bd%d1%82-%d0%b2-%d0%b3%d1%80-%d1%81%d0%b0%d0%bd%d0%b4%d0%b0%d0%bd%d1%81%d0%ba/"
  },
  {
    title: "Furnished studio for sale in Sapphire Residence Bansko",
    price: "37 500 €",
    area: "30 m2",
    id: "№ 937",
    category: "Apartment",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2026/01/сапфир-резиденс-банско-680x510.jpg",
    href: "https://makler-realty.com/en/listing/%d0%bf%d1%80%d0%be%d0%b4%d0%b0%d0%b2%d0%b0-%d1%81%d1%82%d1%83%d0%b4%d0%b8%d0%be-%d0%b2-%d1%81%d0%b0%d0%bf%d1%84%d0%b8%d1%80-%d0%b1%d0%b0%d0%bd%d1%81%d0%ba%d0%be/"
  },
  {
    title: "Two-bedroom apartment for sale in Ofrinio, Greece",
    price: "139 000 €",
    area: "42 m2",
    id: "№ 893",
    category: "Apartment",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2025/05/893-1-2-680x395.jpg",
    href: "https://makler-realty.com/en/listing/%d0%bf%d1%80%d0%be%d0%b4%d0%b0%d0%b2%d0%b0-%d1%82%d1%80%d0%b8%d1%81%d1%82%d0%b0%d0%b5%d0%bd-%d0%b0%d0%bf%d0%b0%d1%80%d1%82%d0%b0%d0%bc%d0%b5%d0%bd%d1%82-%d0%b2-%d0%be%d1%84%d1%80%d0%b8%d0%bd%d0%b8/"
  },
  {
    title: "Equipped greenhouse in the town of Sandanski",
    price: "175 000 €",
    area: "2800 m2",
    id: "№ 814",
    category: "Commercial",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2024/12/814-2-680x383.jpeg",
    href: "https://makler-realty.com/en/listing/%d0%be%d0%b1%d0%be%d1%80%d1%83%d0%b4%d0%b2%d0%b0%d0%bd%d0%b0-%d0%be%d1%80%d0%b0%d0%bd%d0%b6%d0%b5%d1%80%d0%b8%d1%8f-%d0%b2-%d0%b3%d1%80-%d1%81%d0%b0%d0%bd%d0%b4%d0%b0%d0%bd%d1%81%d0%ba%d0%b8/"
  },
  {
    title: "A mansion for sale in the area of the town of Sandanski",
    price: "480 000 €",
    area: "439 m2",
    id: "№ 873",
    category: "Villa",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2023/11/873-10-680x510.jpeg",
    href: "https://makler-realty.com/en/listing/%d0%bf%d1%80%d0%be%d0%b4%d0%b0%d0%b2%d0%b0-%d0%b8%d0%bc%d0%b5%d0%bd%d0%b8%d0%b5-%d0%b2-%d0%b3%d1%80-%d1%81%d0%b0%d0%bd%d0%b4%d0%b0%d0%bd%d1%81%d0%ba%d0%b8/"
  },
  {
    title: "Big plot of land and buildings for sale near Sandanski",
    price: "85 000 €",
    area: "20740 m2",
    id: "№ 791",
    category: "Land",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2021/03/791-1-680x383.jpg",
    href: "https://makler-realty.com/en/listing/big-plot-of-land-and-buildings-for-sale-near-sandanski/"
  },
  {
    title: "Big apartment for sale in Park Hotel Sandanski",
    price: "250 000 €",
    area: "93 m2",
    id: "№ 778",
    category: "Apartment",
    offer: "sale",
    image: "https://makler-realty.com/wp-content/uploads/2018/03/778-dron-680x383.jpg",
    href: "https://makler-realty.com/en/listing/zwei-zimmer-wohnung-zum-verkauf-in-park-hotel-pirin-sandanski/"
  },
  {
    title: "One-bedroom apartment for rent in the park of Sandanski",
    price: "400 €",
    area: "65 m2",
    id: "№ 957",
    category: "Apartment",
    offer: "rent",
    image: "https://makler-realty.com/wp-content/uploads/2026/06/957-1-680x510.jpg",
    href: "https://makler-realty.com/en/listing/%d0%b4%d0%b2%d1%83%d1%81%d1%82%d0%b0%d0%b5%d0%bd-%d0%b0%d0%bf%d0%b0%d1%80%d1%82%d0%b0%d0%bc%d0%b5%d0%bd%d1%82-%d0%bf%d0%be%d0%b4-%d0%bd%d0%b0%d0%b5%d0%bc-%d0%b2-%d0%bf%d0%b0%d1%80%d0%ba%d0%b0-%d0%bd/"
  }
];

const grid = document.querySelector("#listings");
const count = document.querySelector("#result-count");
const search = document.querySelector("#search");
const category = document.querySelector("#category");
const offer = document.querySelector("#offer");

function renderCards() {
  grid.innerHTML = listings.map((listing) => `
    <article class="property-card" data-search="${listing.title.toLowerCase()} ${listing.category.toLowerCase()} ${listing.offer}" data-category="${listing.category}" data-offer="${listing.offer}">
      <img src="${listing.image}" alt="${listing.title}" loading="lazy">
      <div class="property-body">
        <div class="property-topline">
          <span class="price">${listing.price}</span>
          <span class="tag">${listing.offer === "rent" ? "Rent" : "Sell"}</span>
        </div>
        <h3>${listing.title}</h3>
        <div class="meta">
          <span>${listing.area}</span>
          <span>${listing.id}</span>
        </div>
        <a class="property-link" href="${listing.href}" target="_blank" rel="noreferrer">Open listing</a>
      </div>
    </article>
  `).join("");
}

function applyFilters() {
  const query = search.value.trim().toLowerCase();
  const selectedCategory = category.value;
  const selectedOffer = offer.value;
  let visible = 0;

  document.querySelectorAll(".property-card").forEach((card) => {
    const matchesQuery = !query || card.dataset.search.includes(query);
    const matchesCategory = selectedCategory === "all" || card.dataset.category === selectedCategory;
    const matchesOffer = selectedOffer === "all" || card.dataset.offer === selectedOffer;
    const show = matchesQuery && matchesCategory && matchesOffer;
    card.hidden = !show;
    if (show) visible += 1;
  });

  count.textContent = `${visible} ${visible === 1 ? "property" : "properties"}`;
}

renderCards();
[search, category, offer].forEach((control) => {
  control.addEventListener("input", applyFilters);
});
applyFilters();
