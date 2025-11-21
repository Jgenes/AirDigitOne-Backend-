const pool = require("../config/db");
const { v4: uuid } = require("uuid");

// GET CATEGORIES + SUBCATEGORIES + ITEMS (user-selected marked)
exports.getCategories = async (req, res) => {
    try {
        const userId = req.user.id; // from JWT

        const categoriesRes = await pool.query("SELECT * FROM categories ORDER BY name ASC");
        const subcategoriesRes = await pool.query("SELECT * FROM subcategories ORDER BY name ASC");
        const itemsRes = await pool.query("SELECT * FROM interest_items ORDER BY name ASC");
        const userItemsRes = await pool.query(
            "SELECT item_id FROM user_interests WHERE user_id=$1",
            [userId]
        );
        const userItems = userItemsRes.rows.map(r => r.item_id);

        const categories = categoriesRes.rows.map(cat => {
            const subcategories = subcategoriesRes
                .filter(sub => sub.category_id === cat.id)
                .map(sub => {
                    const items = itemsRes
                        .filter(item => item.subcategory_id === sub.id)
                        .map(item => ({
                            id: item.id,
                            name: item.name,
                            selected: userItems.includes(item.id),
                        }));
                    return { id: sub.id, name: sub.name, items };
                });
            return { id: cat.id, name: cat.name, subcategories };
        });

        res.json({ categories });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};

// SAVE USER INTERESTS
exports.saveUserInterests = async (req, res) => {
    try {
        const userId = req.user.id;
        const { interests } = req.body;

        if (!Array.isArray(interests) || interests.length === 0)
            return res.status(400).json({ error: "Invalid interests" });

        await pool.query("DELETE FROM user_interests WHERE user_id=$1", [userId]);

        const promises = [];
        for (let cat of interests) {
            const { categoryId, itemIds } = cat;
            if (!Array.isArray(itemIds)) continue;

            for (let itemId of itemIds) {
                promises.push(
                    pool.query(
                        "INSERT INTO user_interests (id, user_id, category_id, item_id) VALUES ($1,$2,$3,$4)",
                        [uuid(), userId, categoryId, itemId]
                    )
                );
            }
        }

        await Promise.all(promises);
        res.json({ message: "Interests saved successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};
