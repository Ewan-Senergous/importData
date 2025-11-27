SELECT
  atr_0.cat_id AS atr_0_id,
  atr_0.cat_label AS atr_0_label,
  atr_1.cat_id AS atr_1_id,
  atr_1.cat_label AS atr_1_label,
  atr_2.cat_id AS atr_2_id,
  atr_2.cat_label AS atr_2_label,
  atr_3.cat_id AS atr_3_id,
  atr_3.cat_label AS atr_3_label,
  atr_4.cat_id AS atr_4_id,
  atr_4.cat_label AS atr_4_label,
  atr_5.cat_id AS atr_5_id,
  atr_5.cat_label AS atr_5_label,
  atr_6.cat_id AS atr_6_id,
  atr_6.cat_label AS atr_6_label,
  atr_7.cat_id AS atr_7_id,
  atr_7.cat_label AS atr_7_label
FROM
  (
    (
      (
        (
          (
            (
              (
                produit.category atr_0
                LEFT JOIN produit.category atr_1 ON (((atr_0.cat_id) :: text = (atr_1.fk_parent) :: text))
              )
              LEFT JOIN produit.category atr_2 ON (((atr_1.cat_id) :: text = (atr_2.fk_parent) :: text))
            )
            LEFT JOIN produit.category atr_3 ON (((atr_2.cat_id) :: text = (atr_3.fk_parent) :: text))
          )
          LEFT JOIN produit.category atr_4 ON (((atr_3.cat_id) :: text = (atr_4.fk_parent) :: text))
        )
        LEFT JOIN produit.category atr_5 ON (((atr_4.cat_id) :: text = (atr_5.fk_parent) :: text))
      )
      LEFT JOIN produit.category atr_6 ON (((atr_5.cat_id) :: text = (atr_6.fk_parent) :: text))
    )
    LEFT JOIN produit.category atr_7 ON (((atr_6.cat_id) :: text = (atr_7.fk_parent) :: text))
  )
ORDER BY
  atr_0.cat_id,
  atr_1.cat_id,
  atr_2.cat_id,
  atr_3.cat_id,
  atr_4.cat_id,
  atr_5.cat_id,
  atr_6.cat_id,
  atr_7.cat_id;