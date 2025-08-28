import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
    name: 'vieewBucket',
    isDefault: true,
    access: (allow) => ({
        'media/content/*': [
            allow.guest.to(['read']),
            allow.authenticated.to(['read', 'write', 'delete'])
        ],
        'media/profile-pictures/{entity_id}/*': [
            allow.entity('identity').to(['read', 'write', 'delete']),
            allow.guest.to(['read']),
            allow.authenticated.to(['read'])
        ]
    })
})

export const assetStorage = defineStorage({
    isDefault:false,
  name: 'vieewAssets',
  access: (allow) => ({
    'public/*': [ allow.guest.to(['read']) ], // files are public via CloudFront; S3 will be locked to CF below
  }),
});