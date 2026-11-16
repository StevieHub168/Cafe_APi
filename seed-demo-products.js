// DEMO DATA ONLY - fake laptops so the app has something to show.
// Safe to run more than once:
//   - a product whose SKU does not exist yet is created;
//   - one that already exists is left alone, except that a MISSING picture / description / other prices are filled in
//     (anything you typed yourself is never overwritten).
// It goes through ProductService, so the Mac / Windows brand rules are applied.
// Delete the demo rows any time from the Products tab - or delete the whole category.
require('dotenv').config();
const db = require('./src/config/database');
const ProductService = require('./src/services/productService');
const CategoryService = require('./src/services/categoryService');
const Product = require('./src/models/Product');

// Photos (Unsplash, checked by eye): real Mac photos for Macs; Dell, ASUS, HP and Surface photos for those brands.
// No Acer- or MSI-specific photo, so Acer uses generic Windows-laptop shots and MSI has none. Replace any from the app.
const photo = (id) => `https://images.unsplash.com/${id}?w=600&q=80`;

// A few demo products get a second / third photo, so the Menu gallery has something to flip through.
const morePhotos = {
    'MAC-001':     ['photo-1525547719571-a2d4ac8945e2'],
    'MAC-003':     ['photo-1542393545-10f5cde2c810', 'photo-1603302576837-37561b2e2302'],
    'WIN-DEL-002': ['photo-1593642633279-1796119d5482', 'photo-1593642532400-2682810df593'],
};

// category, brand, sku, name, model, description (one spec per line), price, other prices, stock, min stock, image
const demo = [
    // ---------- Mac (brand is always Apple) ----------
    ['Mac', 'Apple', 'MAC-001', 'MacBook Air 13" M2', 'MacBook Air M2',
        'Chip M2\nRam 8GB | Storage 256GB', 1099,
        [{ label: '16GB / 512GB', price: 1299 }], 6, 2, photo('photo-1611186871348-b1ce696e52c9')],
    ['Mac', 'Apple', 'MAC-002', 'MacBook Air 15" M3', 'MacBook Air 15 M3',
        'Chip M3\nRam 16GB | Storage 512GB', 1299,
        [{ label: '24GB / 1TB', price: 1699 }], 4, 2, photo('photo-1484788984921-03950022c9ef')],
    ['Mac', 'Apple', 'MAC-003', 'MacBook Pro 14" M3', 'MacBook Pro 14 M3',
        'Chip M3\nRam 8GB | Storage 512GB', 1599, [], 3, 1, photo('photo-1517336714731-489689fd1ca8')],
    ['Mac', 'Apple', 'MAC-004', 'MacBook Pro 16" M3 Pro', 'MacBook Pro 16 M3 Pro',
        'Chip M3 Pro\nRam 18GB | Storage 512GB', 2499, [], 2, 1, photo('photo-1602080858428-57174f9431cf')],
    ['Mac', 'Apple', 'MAC-005', 'MacBook Air M1', 'MacBook Air 13 M1',
        'Chip M1\nRam 8GB | Storage 256GB', 799,
        [{ label: '16GB / 512GB', price: 949 }], 1, 2, photo('photo-1496181133206-80ce9b88a853')],
    ['Mac', 'Apple', 'MAC-006', 'MacBook Pro 2019 15 inch', 'MacBook Pro 15 2019',
        'Chip Core i9\nRam 32GB | Storage 1T', 1099, [], 1, 0, photo('photo-1542393545-10f5cde2c810')],  // one-off unit: stock tracking off

    // ---------- Windows ----------
    ['Windows', 'Asus', 'WIN-ASU-001', 'Asus Vivobook 15', 'X1504ZA',
        'Core i5 Gen 13\nRam 8GB DDR4 | SSD 512GB\nIntel Iris Xe', 549,
        [{ label: 'Ram 16GB', price: 599 }], 10, 3, photo('photo-1544731612-de7f96afe55f')],
    ['Windows', 'Asus', 'WIN-ASU-002', 'Asus Zenbook 14 OLED', 'UX3402VA',
        'Core Ultra 7\nRam 16GB LPDDR5X | SSD 1TB\n14" 2.8K OLED', 949, [], 5, 2, photo('photo-1593642533144-3d62aa4783ec')],
    ['Windows', 'Asus', 'WIN-ASU-003', 'Asus ROG Strix G16', 'G614JV',
        'Core i9 Gen 13, 16" 165Hz\nRam 16GB DDR5 | SSD 1TB\nGPU RTX 4060 8GB', 1499, [], 2, 2, photo('photo-1544731612-de7f96afe55f')],
    ['Windows', 'Asus', 'WIN-ASU-004', 'Asus TUF A15', 'TUF Gaming A15',
        'Ryzen 7-7450HS\nRam 8GB DDR5 | M2 512 GB\nGPU 2050 4GB', 749,
        [{ label: 'Ram 16GB', price: 799 }], 5, 2, photo('photo-1544731612-de7f96afe55f')],

    ['Windows', 'Dell', 'WIN-DEL-001', 'Dell Inspiron 15', 'Inspiron 3520',
        'Core i5 Gen 13\nRam 8GB DDR4 | SSD 512GB', 599,
        [{ label: 'Ram 16GB', price: 649 }], 8, 3, photo('photo-1588872657578-7efd1f1555ed')],
    ['Windows', 'Dell', 'WIN-DEL-002', 'Dell XPS 13', 'XPS 9315',
        'Core i7 Gen 12\nRam 16GB | SSD 512GB\n13.4" FHD+ touch', 1199,
        [{ label: 'Ram 32GB / SSD 1TB', price: 1449 }], 4, 2, photo('photo-1593642702821-c8da6771f0c6')],
    ['Windows', 'Dell', 'WIN-DEL-003', 'Dell Latitude 14', 'Latitude 5440',
        'Core i5 Gen 13 vPro\nRam 16GB | SSD 512GB', 999, [], 0, 2, photo('photo-1593642632823-8f785ba67e45')],

    ['Windows', 'HP', 'WIN-HP-001', 'HP Pavilion 15', '15-eg3000',
        'Core i5 Gen 13\nRam 8GB DDR4 | SSD 512GB\n15.6" FHD', 699,
        [{ label: 'Core i7 / Ram 16GB', price: 799 }], 7, 3, photo('photo-1618424181497-157f25b6ddd5')],
    ['Windows', 'HP', 'WIN-HP-002', 'HP Envy x360 14', '14-es0013dx',
        'Ryzen 7 7730U\nRam 16GB | SSD 512GB\n14" 2-in-1 touch', 899, [], 3, 2, photo('photo-1618424181497-157f25b6ddd5')],
    ['Windows', 'HP', 'WIN-HP-003', 'HP Victus 16', '16-s0023dx',
        'Ryzen 5 8645HS\nRam 16GB DDR5 | SSD 512GB\nGPU RTX 4050 6GB', 1049, [], 5, 2, photo('photo-1618424181497-157f25b6ddd5')],

    ['Windows', 'Acer', 'WIN-ACE-001', 'Acer Aspire 5', 'A515-58',
        'Core i5 Gen 13\nRam 8GB | SSD 512GB\n15.6" FHD', 629,
        [{ label: 'Ram 16GB', price: 679 }], 12, 4, photo('photo-1593642533144-3d62aa4783ec')],
    ['Windows', 'Acer', 'WIN-ACE-002', 'Acer Swift Go 14', 'SFG14-71',
        'Core Ultra 5\nRam 16GB LPDDR5X | SSD 512GB\n14" 2.8K OLED', 949, [], 4, 2, photo('photo-1593642634367-d91a135587b5')],
    ['Windows', 'Acer', 'WIN-ACE-003', 'Acer Nitro V 15', 'ANV15-51',
        'Core i5 Gen 13\nRam 8GB DDR5 | SSD 512GB\nGPU RTX 4050 6GB', 899, [], 1, 2, photo('photo-1593642532400-2682810df593')],

    ['Windows', 'Surface', 'WIN-SUR-001', 'Surface Laptop Go 3', 'i5 / 8GB / 256GB',
        'Core i5 Gen 12\nRam 8GB | SSD 256GB\n12.4" touch', 799,
        [{ label: 'Ram 16GB / SSD 256GB', price: 899 }], 6, 2, photo('photo-1587614382346-4ec70e388b28')],
    ['Windows', 'Surface', 'WIN-SUR-002', 'Surface Laptop 5 13.5"', 'i5 / 8GB / 512GB',
        'Core i5 Gen 12\nRam 8GB | SSD 512GB\n13.5" PixelSense touch', 1099, [], 3, 2, photo('photo-1587614382346-4ec70e388b28')],
    ['Windows', 'Surface', 'WIN-SUR-003', 'Surface Laptop Studio 2', 'i7 / 16GB / 512GB',
        'Core i7 Gen 13\nRam 16GB | SSD 512GB\nGPU RTX 4050 6GB', 1999, [], 2, 1, photo('photo-1587614382346-4ec70e388b28')],

    // MSI is not one of the starting Windows brands: this seeder adds it (you can delete it from the Products tab).
    ['Windows', 'MSI', 'WIN-MSI-001', 'MSI Cyborg 17" 144Hz', 'Cyborg 17',
        'Cpu i7 GEN 13, DDR5 16 Gb\nSSD 512 Gb, RTX 5060', 1199,
        [{ label: 'Ram 32GB / SSD 1TB', price: 1399 }], 3, 1, null],
];

async function ensureBrand(category, brand) {
    if (category.brands && category.brands.some(b => b.toLowerCase() === brand.toLowerCase())) return false;
    if (!category.brands || category.brands.length === 0) return false; // free-text category: any brand is fine
    await CategoryService.addBrand(category.id, brand);
    category.brands.push(brand);
    return true;
}

async function run() {
    try {
        const categories = await CategoryService.getAllCategories();
        const byName = Object.fromEntries(categories.map(c => [c.name, c]));

        let added = 0, skipped = 0, filled = 0;
        for (const [categoryName, brand, sku, name, model, description, price, extras, stock, min, image] of demo) {
            const category = byName[categoryName];
            if (!category) {
                console.warn(`  ! category "${categoryName}" not found - skipping ${sku} (run "npm run seed" first)`);
                skipped++;
                continue;
            }
            if (await ensureBrand(category, brand)) console.log(`  + added brand "${brand}" to ${categoryName}`);

            try {
                await ProductService.createProduct({
                    sku, name, category_id: category.id, brand, model, description,
                    selling_price: price, extra_prices: extras,
                    // Stock tracking is ON when there is a real quantity or a low-stock level; otherwise a single item.
                    track_stock: stock !== 1 || min > 0,
                    stock_quantity: stock, min_stock_level: min,
                    images: [image, ...(morePhotos[sku] || []).map(photo)].filter(Boolean)
                });
                added++;
            } catch (err) {
                if (err.message !== 'SKU already exists') throw new Error(`${sku}: ${err.message}`);
                skipped++;

                // Already there: only fill in what is missing, never overwrite what you set yourself.
                const row = await Product.findBySku(sku);
                const fill = {};
                // Photos: add the demo gallery only to a product that still has just its original demo photo.
                const gallery = (morePhotos[sku] || []).map(photo);
                if (image && row.images.length === 0) fill.images = [image, ...gallery];
                else if (image && gallery.length > 0 && row.images.length === 1 && row.images[0] === image) fill.images = [image, ...gallery];
                if (!row.description && description) fill.description = description;
                if ((row.extra_prices || []).length === 0 && extras.length > 0) fill.extra_prices = extras;
                if (Object.keys(fill).length > 0) {
                    await ProductService.updateProduct(row.id, fill);
                    filled++;
                }
            }
        }
        console.log(`Demo products: ${added} added, ${skipped} already there (${filled} of them got missing details filled in).`);
    } catch (err) {
        console.error('Demo seed error:', err.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

run();
