SELECT
  kit.kit_label,
  attribute_carac.atr_label,
  kat.kat_value AS valeur,
  attribute.atr_value AS unit
FROM
  (
    (
      (
        kit
        JOIN kit_attribute kat ON ((kit.kit_id = kat.fk_kit))
      )
      JOIN attribute attribute_carac ON (
        (
          (
            (attribute_carac.atr_nature) :: text = 'CARAC' :: text
          )
          AND (
            kat.fk_attribute_characteristic = attribute_carac.atr_id
          )
        )
      )
    )
    JOIN attribute ON ((kat.fk_attribute_unite = attribute.atr_id))
  );