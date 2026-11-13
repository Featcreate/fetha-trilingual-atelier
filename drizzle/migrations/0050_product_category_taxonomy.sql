-- Introduce the approved ten-category taxonomy while preserving ambiguous legacy product types.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_subcategory text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_product_type_check CHECK (product_type IN (
  'ebook','pdf','template','educational','bundle','software','app','printable','planner','course','worksheets','flashcards','audio','video','graphics','other',
  'graphisme','modeles','livres-numeriques','ressources-educatives','agendas-organisation','logiciels-applications','contenus-audio-visuels','formations-cours','creation-fabrication-numerique','packs-bundles-numeriques'
));

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_subcategory_check;
ALTER TABLE public.products ADD CONSTRAINT products_product_subcategory_check CHECK (product_subcategory IS NULL OR product_subcategory IN (
  'illustrations-dessins-logos', 'photographies', 'icones-stickers', 'fonds-ecran', 'motifs-textures',
  'reseaux-sociaux', 'cv-carriere', 'presentations', 'business-marketing', 'documents-formulaires',
  'livres-enfants-coloriage', 'romans-nouvelles', 'livres-educatifs', 'guides-ouvrages-pratiques', 'livres-specialises',
  'fiches-exercices', 'cartes-memoire', 'lecons-supports-cours', 'evaluations-examens', 'activites-pedagogiques',
  'agendas-planificateurs', 'suivi-habitudes', 'organisation-personnelle', 'gestion-budget', 'objectifs-productivite',
  'applications-mobiles', 'logiciels-ordinateur', 'applications-web', 'extensions-plugins', 'jeux-video-educatifs',
  'musique-sons', 'podcasts-livres-audio', 'effets-sonores', 'videos-sequences', 'animations-motion-design',
  'cours-en-ligne', 'formations-professionnelles', 'cours-langues', 'programmation-technologie', 'ateliers-masterclass',
  'modeles-3d', 'patrons-couture', 'patrons-crochet-tricot', 'fichiers-decoupe', 'plans-projets-diy',
  'packs-graphiques', 'packs-modeles', 'packs-livres-numeriques', 'packs-ressources-educatives',
  'packs-agendas-organisation', 'packs-logiciels-applications', 'packs-audio-visuels',
  'packs-formations-cours', 'packs-creation-fabrication-numerique'
));

-- Map only legacy values with a clear equivalent. Bundle products deliberately retain a NULL
-- subcategory until their seller chooses the correct bundle family. Ambiguous pdf/printable/other
-- values stay legacy and are never assigned a guessed category.
-- Map only legacy values whose top-level category is clear. Do not infer a
-- subcategory from a broad legacy type: sellers can choose it later when editing.
-- Ambiguous pdf/printable/other values remain unchanged until manually classified.
UPDATE public.products SET
  product_type = CASE product_type
    WHEN 'ebook' THEN 'livres-numeriques'
    WHEN 'template' THEN 'modeles'
    WHEN 'educational' THEN 'ressources-educatives'
    WHEN 'bundle' THEN 'packs-bundles-numeriques'
    WHEN 'software' THEN 'logiciels-applications'
    WHEN 'app' THEN 'logiciels-applications'
    WHEN 'planner' THEN 'agendas-organisation'
    WHEN 'course' THEN 'formations-cours'
    WHEN 'worksheets' THEN 'ressources-educatives'
    WHEN 'flashcards' THEN 'ressources-educatives'
    WHEN 'audio' THEN 'contenus-audio-visuels'
    WHEN 'video' THEN 'contenus-audio-visuels'
    WHEN 'graphics' THEN 'graphisme'
    ELSE product_type
  END
WHERE product_type IN (
  'ebook','template','educational','bundle','software','app','planner','course',
  'worksheets','flashcards','audio','video','graphics'
);

-- Enforce the category/subcategory relationship, not merely membership in two independent lists.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_subcategory_pair_check;
ALTER TABLE public.products ADD CONSTRAINT products_category_subcategory_pair_check CHECK (
  product_subcategory IS NULL OR
  (product_type = 'graphisme' AND product_subcategory IN (
    'illustrations-dessins-logos','photographies','icones-stickers','fonds-ecran','motifs-textures'
  )) OR
  (product_type = 'modeles' AND product_subcategory IN (
    'reseaux-sociaux','cv-carriere','presentations','business-marketing','documents-formulaires'
  )) OR
  (product_type = 'livres-numeriques' AND product_subcategory IN (
    'livres-enfants-coloriage','romans-nouvelles','livres-educatifs','guides-ouvrages-pratiques','livres-specialises'
  )) OR
  (product_type = 'ressources-educatives' AND product_subcategory IN (
    'fiches-exercices','cartes-memoire','lecons-supports-cours','evaluations-examens','activites-pedagogiques'
  )) OR
  (product_type = 'agendas-organisation' AND product_subcategory IN (
    'agendas-planificateurs','suivi-habitudes','organisation-personnelle','gestion-budget','objectifs-productivite'
  )) OR
  (product_type = 'logiciels-applications' AND product_subcategory IN (
    'applications-mobiles','logiciels-ordinateur','applications-web','extensions-plugins','jeux-video-educatifs'
  )) OR
  (product_type = 'contenus-audio-visuels' AND product_subcategory IN (
    'musique-sons','podcasts-livres-audio','effets-sonores','videos-sequences','animations-motion-design'
  )) OR
  (product_type = 'formations-cours' AND product_subcategory IN (
    'cours-en-ligne','formations-professionnelles','cours-langues','programmation-technologie','ateliers-masterclass'
  )) OR
  (product_type = 'creation-fabrication-numerique' AND product_subcategory IN (
    'modeles-3d','patrons-couture','patrons-crochet-tricot','fichiers-decoupe','plans-projets-diy'
  )) OR
  (product_type = 'packs-bundles-numeriques' AND product_subcategory IN (
    'packs-graphiques','packs-modeles','packs-livres-numeriques','packs-ressources-educatives',
    'packs-agendas-organisation','packs-logiciels-applications','packs-audio-visuels',
    'packs-formations-cours','packs-creation-fabrication-numerique'
  ))
);

CREATE INDEX IF NOT EXISTS products_product_type_subcategory_idx
  ON public.products (product_type, product_subcategory);
