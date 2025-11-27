SELECT
  DISTINCT pp.fk_product,
  pp.pp_date,
  pp.pp_amount,
  pp.pp_discount,
  pp.pp_net_amount,
  pp.pro_cenov_id,
  pp.sup_id,
  pp.fk_document
FROM
  (
    produit.price_purchase pp
    JOIN (
      SELECT
        price_purchase.fk_product,
        max(price_purchase.pp_date) AS max_pp_date
      FROM
        produit.price_purchase
      GROUP BY
        price_purchase.fk_product
    ) pp_latest ON (
      (
        (pp.fk_product = pp_latest.fk_product)
        AND (pp.pp_date = pp_latest.max_pp_date)
      )
    )
  )
ORDER BY
  pp.fk_product;