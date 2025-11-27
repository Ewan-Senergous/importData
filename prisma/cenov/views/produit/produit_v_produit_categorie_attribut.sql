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
              produit.produit p
              JOIN produit.produit_categorie pc ON ((p.pro_id = pc.fk_produit))
            )
            JOIN kit k ON ((p.fk_kit = k.kit_id))
          )
          JOIN produit.mv_categorie mv ON ((pc.fk_categorie = mv.cat_id))
        )
        JOIN produit.categorie_attribut ca ON ((mv.fk_parent = ca.fk_categorie))
      )
      JOIN produit.categorie c ON ((ca.fk_categorie = c.cat_id))
    )
    JOIN attribut a ON ((ca.fk_attribute = a.atr_id))
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
            JOIN attribut a2 ON ((ka.fk_attribute_unit = a2.atr_id))
          )
        WHERE
          (
            (ka.fk_kit = k.kit_id)
            AND (ka.fk_attribute_carac = a.atr_id)
          )
      )
    )
  );