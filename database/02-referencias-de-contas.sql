-- Os IDs de accounts são VARCHAR(64) no MER. Estas colunas guardam os mesmos IDs.
-- A conversão de INT para VARCHAR também conserva referências numéricas existentes.
USE `fluxo_pessoal`;

ALTER TABLE `cards` MODIFY `linked_account` VARCHAR(64) NULL;
ALTER TABLE `recurring_entries` MODIFY `account` VARCHAR(64) NULL;
ALTER TABLE `reward_redemptions` MODIFY `account` VARCHAR(64) NULL;
ALTER TABLE `transactions`
    MODIFY `account` VARCHAR(64) NULL,
    MODIFY `destination_account` VARCHAR(64) NULL;
ALTER TABLE `pending_auto_transactions` MODIFY `suggested_account` VARCHAR(64) NULL;
