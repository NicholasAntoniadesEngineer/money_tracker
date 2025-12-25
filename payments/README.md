# Stripe Payment Integration

This folder contains the Stripe payment integration for the Money Tracker application.

## 📚 Documentation

- **[COMPLETE_SETUP_GUIDE.md](./COMPLETE_SETUP_GUIDE.md)** - Complete step-by-step setup guide for the entire payment system
- **[STRIPE_PRICE_SETUP.md](./STRIPE_PRICE_SETUP.md)** - Quick reference for creating Stripe Price objects
- **[SUBSCRIPTION_TIERS.md](./SUBSCRIPTION_TIERS.md)** - Documentation on subscription tier system

## Features

### Subscription Management
- **Multiple Plans**: Support for trial, basic, and premium tiers
- **Upgrades**: Immediate upgrades with proration
- **Downgrades**: Scheduled downgrades that maintain premium access until billing period ends
- **Single Subscription Enforcement**: Automatically cancels existing subscriptions before creating new ones
- **Recurring Billing Toggle**: Users can enable/disable auto-renewal from settings

### Payment Processing
- Stripe Checkout integration for secure payment collection
- Automatic webhook handling for subscription updates
- Payment history tracking
- Invoice generation

### Access Control
- Tier-based feature access
- Trial period management
- Subscription status validation

## Quick Start

For complete setup instructions, see **[COMPLETE_SETUP_GUIDE.md](./COMPLETE_SETUP_GUIDE.md)**.

## Testing

Use Stripe test mode cards:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

See [Stripe Testing Documentation](https://stripe.com/docs/testing) for more test cards.

