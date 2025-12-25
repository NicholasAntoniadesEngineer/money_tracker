/**
 * Payment Service
 * Handles payment history and payment status tracking
 */

const PaymentService = {
    /**
     * Record a payment in payment history
     * @param {string} userId - User ID
     * @param {Object} paymentData - Payment data
     * @returns {Promise<{success: boolean, payment: Object|null, error: string|null}>}
     */
    async recordPayment(userId, paymentData) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            const paymentRecord = {
                user_id: userId,
                subscription_id: paymentData.subscriptionId || null,
                stripe_payment_intent_id: paymentData.stripePaymentIntentId || null,
                stripe_charge_id: paymentData.stripeChargeId || null,
                stripe_invoice_id: paymentData.stripeInvoiceId || null,
                amount: paymentData.amount || 0,
                currency: paymentData.currency || 'eur',
                status: paymentData.status || 'pending',
                payment_method: paymentData.paymentMethod || null,
                payment_date: paymentData.paymentDate ? new Date(paymentData.paymentDate).toISOString() : new Date().toISOString(),
                refunded_amount: paymentData.refundedAmount || 0,
                refunded_date: paymentData.refundedDate ? new Date(paymentData.refundedDate).toISOString() : null,
                metadata: paymentData.metadata || {}
            };
            
            const result = await window.DatabaseService.queryInsert('payment_history', paymentRecord);
            
            if (result.error) {
                console.error('[PaymentService] Error recording payment:', result.error);
                return {
                    success: false,
                    payment: null,
                    error: result.error.message || 'Failed to record payment'
                };
            }
            
            const payment = result.data && result.data.length > 0 ? result.data[0] : null;
            
            console.log('[PaymentService] Payment recorded successfully:', {
                userId: userId,
                amount: paymentRecord.amount,
                status: paymentRecord.status
            });
            
            return {
                success: true,
                payment: payment,
                error: null
            };
        } catch (error) {
            console.error('[PaymentService] Exception recording payment:', error);
            return {
                success: false,
                payment: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Get payment history for current user
     * @param {number} limit - Maximum number of records to return
     * @returns {Promise<{success: boolean, payments: Array|null, error: string|null}>}
     */
    async getPaymentHistory(limit = 50) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            const userId = await window.DatabaseService._getCurrentUserId();
            if (!userId) {
                return {
                    success: false,
                    payments: null,
                    error: 'User not authenticated'
                };
            }
            
            const result = await window.DatabaseService.querySelect('payment_history', {
                filter: { user_id: userId },
                order: [{ column: 'payment_date', ascending: false }],
                limit: limit
            });
            
            if (result.error) {
                console.error('[PaymentService] Error getting payment history:', result.error);
                return {
                    success: false,
                    payments: null,
                    error: result.error.message || 'Failed to get payment history'
                };
            }
            
            const payments = result.data || [];
            
            return {
                success: true,
                payments: payments,
                error: null
            };
        } catch (error) {
            console.error('[PaymentService] Exception getting payment history:', error);
            return {
                success: false,
                payments: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Update payment status
     * @param {string} paymentId - Payment record ID
     * @param {string} status - New status
     * @returns {Promise<{success: boolean, payment: Object|null, error: string|null}>}
     */
    async updatePaymentStatus(paymentId, status) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            const updateData = {
                status: status
            };
            
            const result = await window.DatabaseService.queryUpdate('payment_history', paymentId, updateData);
            
            if (result.error) {
                console.error('[PaymentService] Error updating payment status:', result.error);
                return {
                    success: false,
                    payment: null,
                    error: result.error.message || 'Failed to update payment status'
                };
            }
            
            const payment = result.data && result.data.length > 0 ? result.data[0] : null;
            
            return {
                success: true,
                payment: payment,
                error: null
            };
        } catch (error) {
            console.error('[PaymentService] Exception updating payment status:', error);
            return {
                success: false,
                payment: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.PaymentService = PaymentService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentService;
}

