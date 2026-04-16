errors: Fetching subscription status from: http://localhost:10000/api/v1/subscriptions/current navbar-subscription.js:11:36
Subscription data: 
Object { success: true, data: null }
navbar-subscription.js:28:36
Error loading subscription status: TypeError: can't access property "status", subscription is null
    loadSubscriptionStatus http://localhost:10000/js/dashboard.js:68
    initDashboard http://localhost:10000/js/dashboard.js:24
    async* http://localhost:10000/js/dashboard.js:189
    EventListener.handleEvent* http://localhost:10000/js/dashboard.js:188
dashboard.js:95:17


info: subscription created {"action":"subscription_created","category":"admin","details":{"overrideDays":80,"periodEnd":"2026-07-05T05:56:37.000Z","planKey":"6-month","stripeSubscriptionId":"sub_1TMivRDX2QubxH7T04JRJ4Iv","userId":"69d71e9ae8d6b4c98a00729b"},"service":"jefitness","timestamp":"2026-04-16 00:56:39","userId":"69d1958e98557e87f8bab1f4"} ... but it doesnt sync to user account so i dont get any days displayed and on admin side it doesnt display days left.

http://localhost:10000/api/v1/subscriptions/checkout
[HTTP/1.1 400 Bad Request 49ms]

Direct checkout failed: Error: HTTP 400
    handleApiResponse http://localhost:10000/js/subscriptions.js:84
    createCheckout http://localhost:10000/js/services/SubscriptionService.js:30
    selectPlan http://localhost:10000/js/subscriptions.js:460
    async* http://localhost:10000/js/subscriptions.js:253
    renderPlans http://localhost:10000/js/subscriptions.js:253
    renderPlans http://localhost:10000/js/subscriptions.js:212
    loadUserSubscriptions http://localhost:10000/js/subscriptions.js:332
    async* http://localhost:10000/js/subscriptions.js:692
    async* http://localhost:10000/js/subscriptions.js:661
subscriptions.js:467:13
