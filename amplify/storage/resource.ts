import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
    name: 'vieewBucket',
    access: (allow) => ({
        'media/content/*': [
            allow.guest.to(['read']),
            allow.authenticated.to(['read', 'write', 'delete'])
        ],
        'media/profile-pictures/{entity_id}/*': [
            allow.entity('identity').to(['read', 'write', 'delete']),
            allow.guest.to(['read']),
            allow.authenticated.to(['read'])
        ],
    })
})