# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]
### Added
- Jalon 1 (socle) : projet Vite + React + TypeScript strict, cœur isolé du navigateur (tsconfig sans DOM + test d'architecture sur les imports).
- Interface `AdaptateurFichiers` avec une implémentation en mémoire (tests) et une implémentation File System Access (Chrome, Edge).
- Ouverture d'un dossier d'espace, mémorisation du dossier dans IndexedDB (seule la permission est redemandée), message clair sur les navigateurs non compatibles, liste des bases du dossier.
- Espace de démonstration dans `exemples/espace-demo/`.
### Changed
### Fixed
