SELECT
  c.cat_id,
  c.cat_label,
  a.atr_id,
  a.atr_label,
  ca.cat_atr_required
FROM
  (
    (
      produit.category_attribute ca
      JOIN produit.category c ON ((c.cat_id = ca.fk_category))
    )
    JOIN attribute a ON ((a.atr_id = ca.fk_attribute))
  );