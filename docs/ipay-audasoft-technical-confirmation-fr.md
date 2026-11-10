# Demande de confirmation technique — iPay / Algorea Bazaar

**Organisation iPay :** سوق ألغوريا / Algorea Bazaar  
**Code produit :** `algorea-bazaar`  
**Objet :** confirmations indispensables avant toute activation du paiement en ligne

Bonjour,

Nous préparons l'intégration API iPay de notre plateforme Algorea Bazaar. Avant de connecter le paiement des commandes, nous avons besoin de confirmations écrites pour éviter toute validation erronée ou tout rapprochement financier incorrect.

Notre modèle est le suivant : les acheteurs paient sur le compte iPay de notre organisation ; la plateforme tient ensuite sa propre comptabilité interne (commandes, commission et soldes vendeurs) et effectue séparément les versements manuels aux vendeurs. Nous n'utilisons pas de split payment.

Merci de répondre précisément aux points suivants.

## 1. Montant et devise

Pour `POST /api/admin/transactions/create-oneshot`, le champ `amount` doit-il être exprimé en :
- dinars tunisiens décimaux (ex. `10.500`) ;
- millimes sous forme d'entier (ex. `10500`) ;
- ou une autre unité ?

Merci de fournir un exemple complet pour une commande de **10,500 TND**, avec la valeur exacte envoyée dans le JSON et la valeur affichée/payée par l'acheteur.

Confirmez également si la devise `TND` est obligatoire et si une autre devise de facturation est prise en charge pour notre organisation.

## 2. Vérification serveur-à-serveur d'une transaction

Quel endpoint documenté permet de récupérer une transaction par son identifiant iPay et de vérifier son état final ?

Merci de préciser :
- l'URL et la méthode HTTP ;
- les paramètres de recherche disponibles (ID transaction, `invoice_reference`, `customer_external_id`, code produit) ;
- les champs exacts de la réponse pour le statut, le montant, la devise, le code produit, l'identifiant de transaction et la référence de commande ;
- les valeurs de statut possibles et leur signification ;
- quel statut signifie que les fonds sont effectivement reçus/compensés et disponibles sur le compte marchand.

La simple redirection du navigateur ou un paramètre de retour ne sera pas utilisé comme preuve de paiement.

## 3. Authenticité des Webhooks

Les notifications envoyées aux URLs configurées sur le produit sont-elles signées ou authentifiées ?

Merci de fournir le mécanisme exact : signature HMAC, secret partagé, en-tête dédié, mTLS, IP source documentées ou autre méthode, avec un exemple de vérification côté serveur. Si aucune signature n'est prévue, quelle méthode officielle recommandez-vous pour authentifier chaque événement avant toute action financière ?

## 4. Virements et mandats déclarés

La documentation indique que `transaction.completed` peut être émis après une déclaration de virement bancaire ou de mandat postal par l'acheteur.

Dans ce cas, cet événement signifie-t-il :
- que l'acheteur a seulement déclaré avoir effectué le paiement ;
- que l'administrateur a marqué la transaction comme payée ;
- ou que les fonds ont été effectivement reçus et compensés sur le compte marchand ?

Quel événement ou champ distinct confirme la réception réelle des fonds ? Peut-on désactiver les moyens de paiement à déclaration manuelle pour le produit `algorea-bazaar` ?

## 5. Livraison, tentatives et rejeu des Webhooks

La documentation publique mentionne des tentatives automatiques, tandis que les notes API de notre espace indiquent qu'aucune nouvelle tentative n'est effectuée après un échec HTTP.

Quelle règle s'applique à notre organisation et à la version actuelle de l'API ? Merci de préciser le nombre de tentatives, les délais, les codes HTTP attendus et la procédure officielle pour rejouer une notification manquée.

## 6. Acheteurs internationaux et marketplace

Notre plateforme vise des acheteurs en Tunisie et à l'étranger, avec des vendeurs tunisiens dans la première phase.

Merci de confirmer par écrit :
- les cartes acceptées et les pays d'émission autorisés pour notre compte ;
- la possibilité ou non d'encaisser des cartes Visa/Mastercard émises hors de Tunisie ;
- les devises de facturation et de règlement ;
- l'éligibilité de notre activité de vente de produits numériques (ressources éducatives, fichiers et logiciels) ;
- l'autorisation du modèle où l'organisation encaisse la totalité des commandes puis paie séparément ses vendeurs, sans split payment.

## 7. Configuration produit et frais

Merci de confirmer que le code produit `algorea-bazaar` est utilisable avec `create-oneshot`, et d'indiquer si les URLs de succès/échec et les Webhooks sont configurés exclusivement au niveau du produit ou peuvent être fournis par transaction.

Merci également de confirmer les frais applicables à notre organisation, y compris les frais éventuels des acquéreurs ou méthodes tierces, les remboursements et les virements déclarés.

## 8. Environnement de test

Disposez-vous d'un environnement Sandbox distinct de la production, avec des identifiants et moyens de paiement de test ? Merci de fournir sa base URL, sa procédure d'accès et des scénarios de test sans mouvement de fonds réels.

Nous ne transmettrons aucun secret de production par e-mail et n'effectuerons aucun paiement réel pour valider ces points.

Cordialement,  
**Algorea Bazaar**
