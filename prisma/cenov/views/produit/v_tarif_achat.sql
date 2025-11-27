SELECT
  DISTINCT ta.fk_produit,
  ta.taa_date,
  ta.taa_montant,
  ta.taa_remise,
  ta.taa_montant_net
FROM
  (
    produit.tarif_achat ta
    JOIN (
      SELECT
        tarif_achat.fk_produit,
        max(tarif_achat.taa_date) AS taa_date
      FROM
        produit.tarif_achat
      GROUP BY
        tarif_achat.fk_produit
    ) ta_max ON (
      (
        (ta.fk_produit = ta_max.fk_produit)
        AND (ta.taa_date = ta_max.taa_date)
      )
    )
  );