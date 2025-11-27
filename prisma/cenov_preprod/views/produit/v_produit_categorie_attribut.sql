SELECT
  p.pro_id,
  k.kit_label,
  a.atr_id,
  a.atr_label,
  c.cat_label
FROM
  (
    (
      (
        (
          (
            (
              produit.product p
              JOIN produit.product_category pc ON ((p.pro_id = pc.fk_product))
            )
            JOIN kit k ON ((p.fk_kit = k.kit_id))
          )
          JOIN produit.mv_categorie mv ON ((pc.fk_category = mv.cat_id))
        )
        JOIN produit.category_attribute ca ON ((mv.fk_parent = ca.fk_category))
      )
      JOIN produit.category c ON ((ca.fk_category = c.cat_id))
    )
    JOIN attribute a ON ((ca.fk_attribute = a.atr_id))
  )
WHERE
  (
    NOT (
      EXISTS (
        SELECT
          1
        FROM
          (
            kit_attribute ka
            JOIN attribute a2 ON ((ka.fk_attribute_unite = a2.atr_id))
          )
        WHERE
          (
            (ka.fk_kit = k.kit_id)
            AND (ka.fk_attribute_characteristic = a.atr_id)
          )
      )
    )
  )
ORDER BY
  p.pro_id;