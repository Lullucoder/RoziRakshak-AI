"""
Synthetic Data Generation
Generates realistic training data for all 4 ML models.

Datasets:
1. rider_profiles.csv - 1000 rows for premium engine
2. disruption_history.csv - 1080 rows (180 days × 6 zones) for forecasting
3. claim_signals.csv - 500 rows for fraud + confidence models
"""

import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)



def generate_rider_profiles(n_records: int = 1000, output_dir: str = "./data") -> str:
    """
    Generate synthetic rider profiles for premium engine training.
    
    1000 rows with realistic distributions:
    - City tier: 40% tier-1, 35% tier-2, 25% tier-3
    - Monsoon weeks (24-38) have higher disruption probability
    - Premium formula: higher disruption + lower trust = higher premium
    """
    logger.info(f"Generating {n_records} rider profiles...")
    
    np.random.seed(42)
    
    records = []
    
    for i in range(n_records):
        # City tier distribution
        city_tier = np.random.choice([1, 2, 3], p=[0.4, 0.35, 0.25])
        
        # Zone ID (6 zones total)
        zone_id = f"zone_{np.random.randint(1, 7):03d}"
        
        # Week of year
        week_of_year = np.random.randint(1, 53)
        
        # Season flag (aligned with week)
        if 24 <= week_of_year <= 38:
            season_flag = 'monsoon'
            forecasted_disruption_probability = np.random.uniform(0.4, 0.8)
        elif week_of_year <= 12 or week_of_year >= 48:
            season_flag = 'winter'
            forecasted_disruption_probability = np.random.uniform(0.05, 0.2)
        elif 13 <= week_of_year <= 23:
            season_flag = 'summer'
            forecasted_disruption_probability = np.random.uniform(0.15, 0.35)
        else:
            season_flag = 'spring'
            forecasted_disruption_probability = np.random.uniform(0.1, 0.25)
        
        # Shift patterns (morning/afternoon/night)
        shift_start_hour = np.random.choice([6, 8, 10, 14, 16, 18, 22], 
                                           p=[0.2, 0.25, 0.15, 0.15, 0.1, 0.1, 0.05])
        shift_duration_hours = round(np.random.uniform(4.0, 12.0), 1)
        
        # Income slabs
        declared_weekly_income_slab = np.random.choice([500, 1000, 1500, 2000, 2500], 
                                                       p=[0.15, 0.25, 0.30, 0.20, 0.10])
        
        # Claim count (most riders have 0-2 claims)
        claim_count_last_4_weeks = min(np.random.poisson(lam=0.8), 8)
        
        # Trust score (beta distribution skewed toward higher trust)
        trust_score = round(np.random.beta(5, 2), 3)
        
        # Days since registration (exponential distribution)
        days_since_registration = min(int(np.random.exponential(scale=200)), 730)
        days_since_registration = max(1, days_since_registration)
        
        # Prior zone disruption density (varies by zone)
        zone_base_risk = {
            'zone_001': 0.15, 'zone_002': 0.25, 'zone_003': 0.35,
            'zone_004': 0.20, 'zone_005': 0.30, 'zone_006': 0.18
        }
        prior_zone_disruption_density = round(
            zone_base_risk.get(zone_id, 0.2) + np.random.uniform(-0.05, 0.05), 3
        )
        prior_zone_disruption_density = np.clip(prior_zone_disruption_density, 0, 1)
        
        # Calculate target premium (₹19-₹79 range)
        # Formula: base × city_mult × disruption_mult × trust_discount × shift_mult
        base_premium_map = {500: 19, 1000: 29, 1500: 39, 2000: 55, 2500: 65}
        base_premium = base_premium_map[declared_weekly_income_slab]
        
        city_multiplier = {1: 1.3, 2: 1.1, 3: 1.0}[city_tier]
        disruption_multiplier = 1 + (forecasted_disruption_probability * 0.5)
        trust_discount = 1 - (trust_score * 0.15)
        
        # Shift risk (afternoon heat/night risk)
        if 14 <= shift_start_hour < 18:
            shift_multiplier = 1.2
        elif shift_start_hour >= 22 or shift_start_hour < 6:
            shift_multiplier = 1.15
        else:
            shift_multiplier = 1.0
        
        # Claim history penalty
        claim_penalty = 1 + (claim_count_last_4_weeks * 0.05)
        
        # Add realistic noise
        noise = np.random.uniform(0.95, 1.05)
        
        target_premium = base_premium * city_multiplier * disruption_multiplier * trust_discount * shift_multiplier * claim_penalty * noise
        target_premium = round(np.clip(target_premium, 19, 79), 2)
        
        records.append({
            'city_tier': city_tier,
            'zone_id': zone_id,
            'week_of_year': week_of_year,
            'season_flag': season_flag,
            'forecasted_disruption_probability': round(forecasted_disruption_probability, 3),
            'shift_start_hour': shift_start_hour,
            'shift_duration_hours': shift_duration_hours,
            'declared_weekly_income_slab': declared_weekly_income_slab,
            'claim_count_last_4_weeks': claim_count_last_4_weeks,
            'trust_score': trust_score,
            'days_since_registration': days_since_registration,
            'prior_zone_disruption_density': prior_zone_disruption_density,
            'target_premium': target_premium
        })
    
    df = pd.DataFrame(records)
    
    # Save to CSV
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "rider_profiles.csv")
    df.to_csv(output_path, index=False)
    
    logger.info(f"✓ Saved {len(df)} rider profiles to {output_path}")
    
    # Print summary statistics
    logger.info("\n=== RIDER PROFILES SUMMARY ===")
    logger.info(f"City tier distribution:\n{df['city_tier'].value_counts(normalize=True).sort_index()}")
    logger.info(f"\nSeason distribution:\n{df['season_flag'].value_counts()}")
    logger.info(f"\nIncome slab distribution:\n{df['declared_weekly_income_slab'].value_counts().sort_index()}")
    logger.info(f"\nTarget premium stats:")
    logger.info(f"  Min: ₹{df['target_premium'].min():.2f}")
    logger.info(f"  Max: ₹{df['target_premium'].max():.2f}")
    logger.info(f"  Mean: ₹{df['target_premium'].mean():.2f}")
    logger.info(f"  Median: ₹{df['target_premium'].median():.2f}")
    logger.info(f"\nTrust score stats:")
    logger.info(f"  Mean: {df['trust_score'].mean():.3f}")
    logger.info(f"  Std: {df['trust_score'].std():.3f}")
    
    return output_path


def generate_disruption_history(n_zones: int = 6, n_days: int = 180, output_dir: str = "./data") -> str:
    """
    Generate synthetic disruption history for forecasting engine training.
    
    1080 rows (180 days × 6 zones):
    - Monsoon pattern: June-September (weeks 24-38) have significantly more disruptions
    - Weekend pattern: slightly higher disruptions
    - Zone-specific base rates
    """
    logger.info(f"Generating {n_days} days of disruption history for {n_zones} zones...")
    
    np.random.seed(42)
    
    # Generate date range (past 6 months from today)
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=n_days - 1)
    dates = [start_date + timedelta(days=i) for i in range(n_days)]
    
    records = []
    
    # Zone-specific base disruption rates
    zone_base_rates = {
        'zone_001': 0.12,
        'zone_002': 0.18,
        'zone_003': 0.25,
        'zone_004': 0.15,
        'zone_005': 0.22,
        'zone_006': 0.14
    }
    
    for zone_idx in range(1, n_zones + 1):
        zone_id = f"zone_{zone_idx:03d}"
        base_rate = zone_base_rates[zone_id]
        
        for date in dates:
            # Monsoon seasonality (June-September = months 6-9)
            month = date.month
            if 6 <= month <= 9:
                # Monsoon months: 3-4x higher disruption rate
                monsoon_multiplier = np.random.uniform(3.0, 4.5)
            else:
                monsoon_multiplier = 1.0
            
            # Weekend pattern (slightly higher)
            weekend_multiplier = 1.3 if date.weekday() >= 5 else 1.0
            
            # Calculate disruption probability
            disruption_prob = base_rate * monsoon_multiplier * weekend_multiplier
            disruption_prob = min(disruption_prob, 0.85)  # Cap at 85%
            
            # Determine if disruption occurred
            disruption_occurred = 1 if np.random.random() < disruption_prob else 0
            
            records.append({
                'ds': date.strftime('%Y-%m-%d'),
                'zone_id': zone_id,
                'disruption_occurred': disruption_occurred
            })
    
    df = pd.DataFrame(records)
    
    # Save to CSV
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "disruption_history.csv")
    df.to_csv(output_path, index=False)
    
    logger.info(f"✓ Saved {len(df)} disruption events to {output_path}")
    
    # Print summary statistics
    logger.info("\n=== DISRUPTION HISTORY SUMMARY ===")
    logger.info(f"Total disruption events: {df['disruption_occurred'].sum()}")
    logger.info(f"Overall disruption rate: {df['disruption_occurred'].mean():.1%}")
    logger.info(f"\nDisruption rate by zone:")
    for zone in sorted(df['zone_id'].unique()):
        zone_df = df[df['zone_id'] == zone]
        rate = zone_df['disruption_occurred'].mean()
        logger.info(f"  {zone}: {rate:.1%} ({zone_df['disruption_occurred'].sum()} events)")
    
    # Analyze by month
    df['month'] = pd.to_datetime(df['ds']).dt.month
    logger.info(f"\nDisruption rate by month:")
    monthly = df.groupby('month')['disruption_occurred'].mean()
    for month, rate in monthly.items():
        month_name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]
        logger.info(f"  {month_name}: {rate:.1%}")
    
    return output_path


def generate_claim_signals(n_records: int = 500, output_dir: str = "./data") -> str:
    """
    Generate synthetic claim signals for fraud detection and confidence scoring.
    
    500 rows:
    - 90% legitimate claims (is_fraud=0)
    - 10% fraudulent claims (is_fraud=1) with realistic fraud patterns
    - Confidence score derived from fraud signals
    """
    logger.info(f"Generating {n_records} claim signals...")
    
    np.random.seed(42)
    
    n_legitimate = int(n_records * 0.9)
    n_fraud = n_records - n_legitimate
    
    records = []
    
    # Generate legitimate claims (90%)
    for i in range(n_legitimate):
        # Legitimate claims have realistic field activity patterns
        motion_variance = round(np.random.uniform(3.0, 10.0), 2)
        network_type = 1 if np.random.random() < 0.7 else 0  # 70% cellular
        gps_accuracy_radius = round(np.random.uniform(8, 50), 1)
        rtt_ms = round(np.random.uniform(50, 400), 1)
        distance_from_home_cluster_km = round(np.random.uniform(2, 30), 1)
        route_continuity_score = round(np.random.uniform(0.65, 1.0), 3)
        speed_between_pings_kmh = round(np.random.uniform(5, 45), 1)
        claim_frequency_7d = min(np.random.poisson(lam=1.2), 10)
        days_since_registration = np.random.randint(30, 730)
        upi_changed_recently = 1 if np.random.random() < 0.05 else 0  # 5% changed UPI
        simultaneous_claim_density_ratio = round(np.random.uniform(0.5, 2.5), 2)
        shared_device_flag = 0
        claim_timestamp_cluster_flag = 0
        trigger_confirmed = 1 if np.random.random() < 0.95 else 0  # 95% confirmed
        zone_overlap = round(np.random.uniform(0.7, 1.0), 3)
        emulator_flag = 0
        is_fraud = 0
        
        # Confidence score for legitimate claims (high)
        # Based on: trigger confirmed, zone overlap, no emulator, good signals
        confidence_base = 0.75
        if trigger_confirmed and zone_overlap > 0.8 and route_continuity_score > 0.8:
            confidence_score = round(np.random.uniform(0.80, 0.98), 3)
        else:
            confidence_score = round(np.random.uniform(0.60, 0.85), 3)
        
        records.append({
            'motion_variance': motion_variance,
            'network_type': network_type,
            'gps_accuracy_radius': gps_accuracy_radius,
            'rtt_ms': rtt_ms,
            'distance_from_home_cluster_km': distance_from_home_cluster_km,
            'route_continuity_score': route_continuity_score,
            'speed_between_pings_kmh': speed_between_pings_kmh,
            'claim_frequency_7d': claim_frequency_7d,
            'days_since_registration': days_since_registration,
            'upi_changed_recently': upi_changed_recently,
            'simultaneous_claim_density_ratio': simultaneous_claim_density_ratio,
            'shared_device_flag': shared_device_flag,
            'claim_timestamp_cluster_flag': claim_timestamp_cluster_flag,
            'trigger_confirmed': trigger_confirmed,
            'zone_overlap': zone_overlap,
            'emulator_flag': emulator_flag,
            'is_fraud': is_fraud,
            'confidence_score': confidence_score
        })
    
    # Generate fraudulent claims (10%)
    fraud_types = ['gps_spoof', 'speed_violation', 'emulator', 'claim_ring', 'frequency_abuse']
    
    for i in range(n_fraud):
        fraud_type = np.random.choice(fraud_types)
        
        if fraud_type == 'gps_spoof':
            # GPS spoofing: low motion, wifi at home, perfect GPS, poor route continuity
            motion_variance = round(np.random.uniform(0.0, 2.0), 2)
            network_type = 0  # wifi
            gps_accuracy_radius = round(np.random.uniform(5, 15), 1)
            rtt_ms = round(np.random.uniform(20, 80), 1)
            distance_from_home_cluster_km = round(np.random.uniform(0, 3), 1)
            route_continuity_score = round(np.random.uniform(0.1, 0.4), 3)
            speed_between_pings_kmh = round(np.random.uniform(0, 8), 1)
            claim_frequency_7d = np.random.randint(0, 4)
            days_since_registration = np.random.randint(10, 500)
            upi_changed_recently = 0
            simultaneous_claim_density_ratio = round(np.random.uniform(0.5, 2.5), 2)
            shared_device_flag = 0
            claim_timestamp_cluster_flag = 0
            trigger_confirmed = 1
            zone_overlap = round(np.random.uniform(0.2, 0.6), 3)
            emulator_flag = 1 if np.random.random() < 0.6 else 0
            
        elif fraud_type == 'speed_violation':
            # Impossible speed / teleportation
            motion_variance = round(np.random.uniform(3.0, 10.0), 2)
            network_type = 1
            gps_accuracy_radius = round(np.random.uniform(10, 50), 1)
            rtt_ms = round(np.random.uniform(50, 400), 1)
            distance_from_home_cluster_km = round(np.random.uniform(20, 50), 1)
            route_continuity_score = round(np.random.uniform(0.2, 0.5), 3)
            speed_between_pings_kmh = round(np.random.uniform(85, 150), 1)  # Impossible speed
            claim_frequency_7d = np.random.randint(0, 4)
            days_since_registration = np.random.randint(30, 500)
            upi_changed_recently = 0
            simultaneous_claim_density_ratio = round(np.random.uniform(0.5, 2.5), 2)
            shared_device_flag = 0
            claim_timestamp_cluster_flag = 0
            trigger_confirmed = 1
            zone_overlap = round(np.random.uniform(0.3, 0.7), 3)
            emulator_flag = 0
            
        elif fraud_type == 'emulator':
            # Emulator detection
            motion_variance = round(np.random.uniform(0.0, 3.0), 2)
            network_type = 0
            gps_accuracy_radius = round(np.random.uniform(5, 20), 1)
            rtt_ms = round(np.random.uniform(20, 150), 1)
            distance_from_home_cluster_km = round(np.random.uniform(0, 10), 1)
            route_continuity_score = round(np.random.uniform(0.1, 0.5), 3)
            speed_between_pings_kmh = round(np.random.uniform(0, 15), 1)
            claim_frequency_7d = np.random.randint(0, 4)
            days_since_registration = np.random.randint(1, 60)  # New accounts
            upi_changed_recently = 1 if np.random.random() < 0.3 else 0
            simultaneous_claim_density_ratio = round(np.random.uniform(0.5, 2.5), 2)
            shared_device_flag = 0
            claim_timestamp_cluster_flag = 0
            trigger_confirmed = 1
            zone_overlap = round(np.random.uniform(0.2, 0.6), 3)
            emulator_flag = 1  # Emulator detected
            
        elif fraud_type == 'claim_ring':
            # Coordinated fraud ring
            motion_variance = round(np.random.uniform(3.0, 10.0), 2)
            network_type = 1
            gps_accuracy_radius = round(np.random.uniform(10, 50), 1)
            rtt_ms = round(np.random.uniform(50, 400), 1)
            distance_from_home_cluster_km = round(np.random.uniform(5, 30), 1)
            route_continuity_score = round(np.random.uniform(0.6, 1.0), 3)
            speed_between_pings_kmh = round(np.random.uniform(10, 45), 1)
            claim_frequency_7d = np.random.randint(0, 4)
            days_since_registration = np.random.randint(30, 500)
            upi_changed_recently = 0
            simultaneous_claim_density_ratio = round(np.random.uniform(8.0, 15.0), 2)  # High density
            shared_device_flag = 1  # Shared device
            claim_timestamp_cluster_flag = 1  # Clustered timestamps
            trigger_confirmed = 1
            zone_overlap = round(np.random.uniform(0.7, 1.0), 3)
            emulator_flag = 0
            
        else:  # frequency_abuse
            # Excessive claim frequency
            motion_variance = round(np.random.uniform(3.0, 10.0), 2)
            network_type = 1
            gps_accuracy_radius = round(np.random.uniform(10, 50), 1)
            rtt_ms = round(np.random.uniform(50, 400), 1)
            distance_from_home_cluster_km = round(np.random.uniform(5, 30), 1)
            route_continuity_score = round(np.random.uniform(0.6, 1.0), 3)
            speed_between_pings_kmh = round(np.random.uniform(10, 45), 1)
            claim_frequency_7d = np.random.randint(6, 10)  # High frequency
            days_since_registration = np.random.randint(30, 500)
            upi_changed_recently = 1 if np.random.random() < 0.4 else 0  # 40% changed UPI
            simultaneous_claim_density_ratio = round(np.random.uniform(0.5, 2.5), 2)
            shared_device_flag = 0
            claim_timestamp_cluster_flag = 0
            trigger_confirmed = 1
            zone_overlap = round(np.random.uniform(0.7, 1.0), 3)
            emulator_flag = 0
        
        is_fraud = 1
        
        # Confidence score for fraudulent claims (low)
        confidence_score = round(np.random.uniform(0.05, 0.45), 3)
        
        records.append({
            'motion_variance': motion_variance,
            'network_type': network_type,
            'gps_accuracy_radius': gps_accuracy_radius,
            'rtt_ms': rtt_ms,
            'distance_from_home_cluster_km': distance_from_home_cluster_km,
            'route_continuity_score': route_continuity_score,
            'speed_between_pings_kmh': speed_between_pings_kmh,
            'claim_frequency_7d': claim_frequency_7d,
            'days_since_registration': days_since_registration,
            'upi_changed_recently': upi_changed_recently,
            'simultaneous_claim_density_ratio': simultaneous_claim_density_ratio,
            'shared_device_flag': shared_device_flag,
            'claim_timestamp_cluster_flag': claim_timestamp_cluster_flag,
            'trigger_confirmed': trigger_confirmed,
            'zone_overlap': zone_overlap,
            'emulator_flag': emulator_flag,
            'is_fraud': is_fraud,
            'confidence_score': confidence_score
        })
    
    df = pd.DataFrame(records)
    
    # Save to CSV
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "claim_signals.csv")
    df.to_csv(output_path, index=False)
    
    logger.info(f"✓ Saved {len(df)} claim signals to {output_path}")
    
    # Print summary statistics
    logger.info("\n=== CLAIM SIGNALS SUMMARY ===")
    logger.info(f"Fraud distribution:")
    logger.info(f"  Legitimate: {(df['is_fraud'] == 0).sum()} ({(df['is_fraud'] == 0).mean():.1%})")
    logger.info(f"  Fraudulent: {(df['is_fraud'] == 1).sum()} ({(df['is_fraud'] == 1).mean():.1%})")
    
    logger.info(f"\nConfidence score by fraud status:")
    logger.info(f"  Legitimate claims - Mean: {df[df['is_fraud'] == 0]['confidence_score'].mean():.3f}")
    logger.info(f"  Fraudulent claims - Mean: {df[df['is_fraud'] == 1]['confidence_score'].mean():.3f}")
    
    logger.info(f"\nKey fraud indicators:")
    logger.info(f"  Emulator flag: {df['emulator_flag'].sum()} ({df['emulator_flag'].mean():.1%})")
    logger.info(f"  Shared device: {df['shared_device_flag'].sum()} ({df['shared_device_flag'].mean():.1%})")
    logger.info(f"  Timestamp cluster: {df['claim_timestamp_cluster_flag'].sum()} ({df['claim_timestamp_cluster_flag'].mean():.1%})")
    logger.info(f"  High speed (>80 km/h): {(df['speed_between_pings_kmh'] > 80).sum()}")
    
    logger.info(f"\nNetwork type distribution:")
    logger.info(f"  WiFi (0): {(df['network_type'] == 0).sum()} ({(df['network_type'] == 0).mean():.1%})")
    logger.info(f"  Cellular (1): {(df['network_type'] == 1).sum()} ({(df['network_type'] == 1).mean():.1%})")
    
    logger.info(f"\nMotion variance stats:")
    logger.info(f"  Legitimate - Mean: {df[df['is_fraud'] == 0]['motion_variance'].mean():.2f}")
    logger.info(f"  Fraudulent - Mean: {df[df['is_fraud'] == 1]['motion_variance'].mean():.2f}")
    
    return output_path


if __name__ == "__main__":
    """Generate all synthetic datasets"""
    logger.info("=" * 60)
    logger.info("STARTING SYNTHETIC DATA GENERATION")
    logger.info("=" * 60)
    
    # Generate all datasets
    generate_rider_profiles(n_records=1000)
    print()
    generate_disruption_history(n_zones=6, n_days=180)
    print()
    generate_claim_signals(n_records=500)
    
    logger.info("\n" + "=" * 60)
    logger.info("✓ ALL SYNTHETIC DATA GENERATED SUCCESSFULLY!")
    logger.info("=" * 60)
    logger.info("\nGenerated files:")
    logger.info("  - data/rider_profiles.csv (1000 rows)")
    logger.info("  - data/disruption_history.csv (1080 rows)")
    logger.info("  - data/claim_signals.csv (500 rows)")
    logger.info("\nNext steps:")
    logger.info("  1. Review the summary statistics above")
    logger.info("  2. Train models using these datasets")
    logger.info("  3. Run: python main.py to start the API server")


