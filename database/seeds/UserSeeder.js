'use strict'

/*
|--------------------------------------------------------------------------
| UserSeeder
|--------------------------------------------------------------------------
|
| Make use of the Factory instance to seed database with dummy data or
| make use of Lucid models directly.
|
*/
const User = use('App/Models/User')
/** @type {import('@adonisjs/lucid/src/Factory')} */
const Factory = use('Factory')

class UserSeeder {
	async run() {
		// create anonymous user
		let user1 = new User()
		user1 = await user1.save()

		// create definite user
		let user2 = new User()
		user2.username = 'captaincrypto'
		user2.email = 'kylan.hurt@gmail.com'
		user2.password = 'Test123456'
		user2.profile =
			'{"coverImageUrl": "/images/profile/cover/1589512002590-3HPAXNVXEDHFY.jpg", "profileImageUrl": "/images/profile/profile/1589512026061-AHQ67XXROLR2U.jpg"}'
		user2 = await user2.save()
		await Factory.model('App/Models/User').createMany(1)
	}
}

module.exports = UserSeeder
