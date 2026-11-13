/**
 * Values made by the legacy WinForms `Encryption.Encrypt` (`business logic/Encryption.cs`), run
 * once with a fake key and fake plaintext. They prove the Node code reads what legacy wrote
 * (SEC-03 to SEC-08, D-262), not only what it wrote itself. No real SSN or key is here.
 * To make more: copy `Encryption.cs` into a console project, set `Encryption.Key`, and print
 * `plain.Encrypt()` (see docs/security-review-encryption.md).
 */
export interface LegacyVector {
  label: string
  key: string
  plainText: string
  cipherText: string
}

export const legacyVectors: readonly LegacyVector[] = [
  {
    label: 'nine digits',
    key: 'key',
    plainText: '123456789',
    cipherText:
      '36jiUGmghO0/i8/h7wyLSjBA8TnnZifPGezup/P/pbwovhgO6h/uFOUwJg2Ej1mT8qqJAhRFuJo4bDR3C01Vv3cdI8iNXlOJzEU936J3BR4=',
  },
  {
    label: 'non-ASCII text',
    key: 'key',
    plainText: 'Zoë–é 日本',
    cipherText:
      'NQ7dzRoQQOr7LcKxSAg0QG1umBsOXQundjPQKCviQoZvnEruVM3p96MbCxs6fUeWYzY7I5jqLWj8JkDtxZcs7hIDNJrSenB9TmnJPa6XPsfpUKK16ABSzbmLUMEkP9uo',
  },
  {
    label: 'one space',
    key: 'key',
    plainText: ' ',
    cipherText:
      'Y6791wADqX/ZcdC+X+yA9JEZyHA0Z/tAm5WRNI4Sz46SlhdzcbjqbuHjFWyA7AWeBxzyqyU0hAJ+cnEeznB0CPBDH5jdlXEHSl6aHnexLE4=',
  },
  {
    label: 'long key with symbols',
    key: 'long-legacy-style-key/with+symbols=ÄÖ 9f3a',
    plainText: '987654321',
    cipherText:
      '9ORCj09rPxyuxHLoP6t785QQ2Cj33YUi5Di6L+UQ+Jwa4IAIa7OkCkcTikye1gPJS/X5+MPalPnKeWIytHtXriEOT1hafcmVYppd0R5P0pU=',
  },
]
