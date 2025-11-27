SELECT
  c0.cat_id,
  c0.cat_id AS fk_parent,
  0 AS parent_level
FROM
  produit.category c0
UNION
SELECT
  c0.cat_id,
  c1.cat_id AS fk_parent,
  1 AS parent_level
FROM
  (
    produit.category c0
    JOIN produit.category c1 ON ((c0.fk_parent = c1.cat_id))
  )
UNION
SELECT
  c0.cat_id,
  c2.cat_id AS fk_parent,
  2 AS parent_level
FROM
  (
    (
      produit.category c0
      JOIN produit.category c1 ON ((c0.fk_parent = c1.cat_id))
    )
    JOIN produit.category c2 ON ((c1.fk_parent = c2.cat_id))
  )
UNION
SELECT
  c0.cat_id,
  c3.cat_id AS fk_parent,
  3 AS parent_level
FROM
  (
    (
      (
        produit.category c0
        JOIN produit.category c1 ON ((c0.fk_parent = c1.cat_id))
      )
      JOIN produit.category c2 ON ((c1.fk_parent = c2.cat_id))
    )
    JOIN produit.category c3 ON ((c2.fk_parent = c3.cat_id))
  )
UNION
SELECT
  c0.cat_id,
  c4.cat_id AS fk_parent,
  4 AS parent_level
FROM
  (
    (
      (
        (
          produit.category c0
          JOIN produit.category c1 ON ((c0.fk_parent = c1.cat_id))
        )
        JOIN produit.category c2 ON ((c1.fk_parent = c2.cat_id))
      )
      JOIN produit.category c3 ON ((c2.fk_parent = c3.cat_id))
    )
    JOIN produit.category c4 ON ((c3.fk_parent = c4.cat_id))
  )
UNION
SELECT
  c0.cat_id,
  c5.cat_id AS fk_parent,
  5 AS parent_level
FROM
  (
    (
      (
        (
          (
            produit.category c0
            JOIN produit.category c1 ON ((c0.fk_parent = c1.cat_id))
          )
          JOIN produit.category c2 ON ((c1.fk_parent = c2.cat_id))
        )
        JOIN produit.category c3 ON ((c2.fk_parent = c3.cat_id))
      )
      JOIN produit.category c4 ON ((c3.fk_parent = c4.cat_id))
    )
    JOIN produit.category c5 ON ((c4.fk_parent = c5.cat_id))
  )
UNION
SELECT
  c0.cat_id,
  c6.cat_id AS fk_parent,
  6 AS parent_level
FROM
  (
    (
      (
        (
          (
            (
              produit.category c0
              JOIN produit.category c1 ON ((c0.fk_parent = c1.cat_id))
            )
            JOIN produit.category c2 ON ((c1.fk_parent = c2.cat_id))
          )
          JOIN produit.category c3 ON ((c2.fk_parent = c3.cat_id))
        )
        JOIN produit.category c4 ON ((c3.fk_parent = c4.cat_id))
      )
      JOIN produit.category c5 ON ((c4.fk_parent = c5.cat_id))
    )
    JOIN produit.category c6 ON ((c5.fk_parent = c6.cat_id))
  );