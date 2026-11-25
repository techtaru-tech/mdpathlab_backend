/**
 * Printed reports: no fixed printing charge. The patient only agrees that the courier / postage charges, whatever
 * they come to, are theirs to pay; the lab calls them to arrange delivery and settle the amount. Shown at checkout
 * (GET /settings → config.printedReportTerms) and required (printedReportTermsAccepted) to book with printedReport.
 */
export const PRINTED_REPORT_TERMS =
  'Printed reports are sent by courier or post. The courier / postage charges, as applicable, will be paid by you. The lab will call you to confirm the delivery address and charges.';
