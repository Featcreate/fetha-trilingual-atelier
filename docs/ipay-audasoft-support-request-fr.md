# Demande de confirmation technique et commerciale — Algorea Bazaar

**Destinataire suggéré :** contact@audasoft.co  
**Copie technique suggérée :** support@ipay.tn  
**Objet :** Confirmation de l’éligibilité marketplace et du flux API One-shot — Algorea Bazaar

Bonjour,

Nous préparons l’intégration d’iPay comme solution d’encaissement des acheteurs sur **Algorea Bazaar**, une marketplace de produits exclusivement numériques.

Le fonctionnement envisagé est le suivant : l’acheteur paie la commande sur iPay ; les fonds sont encaissés sur le compte de l’organisation Algorea Bazaar ; la plateforme comptabilise ensuite les commissions et les soldes dus aux vendeurs dans son propre registre, puis effectue les reversements aux vendeurs manuellement, selon son calendrier interne. Nous ne souhaitons pas utiliser de split payment ni de reversement automatique par iPay.

Avant toute mise en production, merci de confirmer par écrit les points suivants :

1. **Éligibilité du compte et activité marketplace**  
   Le compte iPay de l’organisation Algorea Bazaar est-il autorisé à encaisser le prix total de commandes contenant des produits numériques appartenant à plusieurs vendeurs, les fonds étant reçus par la plateforme puis reversés séparément et manuellement aux vendeurs ? Quels justificatifs KYC, documents d’entreprise ou autorisations sont requis ?

2. **Montant et devise de l’API One-shot**  
   Pour `POST /api/admin/transactions/create-oneshot`, quelle unité exacte doit être utilisée pour le champ `amount` : millimes, dinars décimaux ou autre ? Merci de fournir un exemple complet de requête et de réponse pour un paiement de **10,500 TND**. Quelles devises sont acceptées pour la création de transaction et quelle devise est effectivement créditée à l’organisation ?

3. **Vérification fiable d’une transaction**  
   Quel endpoint permet de vérifier côté serveur qu’une transaction précise est définitivement payée et que les fonds ont été reçus/crédités ? Merci de fournir le schéma de réponse et les champs permettant de vérifier au minimum l’identifiant de transaction, le montant, la devise, le code produit et la référence de commande externe. L’endpoint `GET /api/admin/transactions` accepte-t-il un filtre fiable par identifiant de transaction ou référence externe ?

4. **Authenticité des webhooks**  
   Les webhooks sont-ils signés (HMAC, signature, secret header, mTLS ou mécanisme équivalent) ? Merci de préciser les en-têtes et la procédure exacte de validation.

5. **Virements bancaires et mandats postaux déclarés**  
   Lorsqu’un acheteur déclare avoir effectué un virement bancaire ou un mandat postal, l’événement `transaction.completed` signifie-t-il que les fonds ont réellement été reçus et compensés, ou uniquement que l’acheteur a déclaré le paiement ? Quel statut ou événement confirme le crédit effectif des fonds ? Peut-on désactiver ces moyens de paiement pour le produit concerné ?

6. **Livraison des webhooks et reprises**  
   La documentation publique indique une relance automatique des webhooks, tandis que la documentation consultée dans le tableau de bord indique qu’aucune relance n’est effectuée en cas d’échec. Quel comportement s’applique à notre compte et à la version actuelle de l’API ? Existe-t-il une fonction de rejeu manuel des événements ?

7. **Configuration du produit**  
   Le code produit `algorea-bazaar` est-il bien compatible avec `create-oneshot` ? Les URL de succès et d’échec peuvent-elles être fournies par transaction, ou doivent-elles obligatoirement être configurées dans la fiche produit ?

8. **Cartes internationales**  
   Le compte et la configuration ClicToPay acceptent-ils les cartes Visa/Mastercard émises hors de Tunisie ? Si oui, quels pays émetteurs et quelles devises sont pris en charge ? Merci de distinguer la devise débitée au client de la devise créditée à notre organisation.

9. **Tarification**  
   Le tarif public annoncé de 1 % par transaction, plafonné à 5 TND, s’applique-t-il à notre organisation et à chacun des moyens de paiement ? Des frais distincts s’appliquent-ils aux virements déclarés, remboursements ou passerelles de cartes ?

Nous souhaitons commencer par des essais hors production, sans encaissement réel, puis activer les paiements uniquement après validation de l’intégration et de l’éligibilité du compte.

Merci de nous transmettre les réponses et, si possible, les exemples API détaillés correspondants.

Cordialement,  
**Algorea Bazaar**
