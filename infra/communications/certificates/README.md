# MAX API trust anchor

`russian_trusted_root_ca.crt` is the public RSA `Russian Trusted Root CA` used by `platform-api2.max.ru`.

- Source: `https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt` (Gosuslugi distribution infrastructure)
- SHA-256 (DER): `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31`
- Validity: 1 March 2022 through 27 February 2032

The communications code validates the fingerprint, CA flag, self-signature identity and validity period before creating a TLS client. The additional trust anchor is accepted only for the exact origin `https://platform-api2.max.ru`; it is not installed into a system trust store.

Replace the file only after MAX announces a CA rotation, download the new certificate from the official source, review its identity and validity, and update the pinned fingerprint in the same change.
