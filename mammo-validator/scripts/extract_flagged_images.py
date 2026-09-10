#!/usr/bin/env python3
"""
Extract Flagged Images from Kaggle Dataset
==========================================

Copies the PNG images listed in research_flagged_cases.csv 
from the Kaggle input dataset to mammo-validator/public/samples/cl/

Usage:
    python scripts/extract_flagged_images.py [path/to/research_flagged_cases.csv] [kaggle_input_root]

Example:
    python scripts/extract_flagged_images.py research_flagged_cases.csv /kaggle/input/datasets/shantanughosh/vindr-mammogram-dataset-dicom-to-png/images_png
"""

import pandas as pd
import os
import sys
import shutil
from pathlib import Path

def main():
    # Default paths
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "research_flagged_cases.csv"
    kaggle_input_root = sys.argv[2] if len(sys.argv) > 2 else "/kaggle/input/datasets/shantanughosh/vindr-mammogram-dataset-dicom-to-png/images_png"
    
    if not os.path.exists(csv_path):
        print(f"❌ Error: CSV file not found: {csv_path}")
        sys.exit(1)
    
    if not os.path.exists(kaggle_input_root):
        print(f"❌ Error: Kaggle input directory not found: {kaggle_input_root}")
        print(f"   Please provide the correct path as the second argument.")
        sys.exit(1)
    
    # Output directory
    output_dir = "mammo-validator/public/samples/cl"
    os.makedirs(output_dir, exist_ok=True)
    
    # Read the CSV
    df = pd.read_csv(csv_path)
    print(f"📄 Loaded {len(df)} flagged cases from {csv_path}")
    
    # Check required columns
    required_cols = ['image_id', 'patient_id', 'image_path']
    for col in required_cols:
        if col not in df.columns:
            print(f"❌ Error: Required column '{col}' not found in CSV")
            sys.exit(1)
    
    copied = 0
    missing = 0
    
    for idx, row in df.iterrows():
        image_id = row['image_id']
        patient_id = row['patient_id']
        
        # Source path from CSV (full path in Kaggle)
        csv_image_path = row['image_path']
        
        # Try multiple possible source locations
        possible_sources = [
            csv_image_path,  # Original path from CSV
            os.path.join(kaggle_input_root, patient_id, f"{image_id}.png"),  # Standard structure
            os.path.join(kaggle_input_root, patient_id, image_id),  # In case image_id already has .png
        ]
        
        src_path = None
        for p in possible_sources:
            if os.path.exists(p):
                src_path = p
                break
        
        if src_path is None:
            print(f"⚠️  Missing: {image_id} (patient: {patient_id})")
            print(f"   Tried: {possible_sources}")
            missing += 1
            continue
        
        # Destination path
        dst_path = os.path.join(output_dir, f"{image_id}.png" if not image_id.endswith('.png') else image_id)
        
        try:
            shutil.copy2(src_path, dst_path)
            copied += 1
            if copied % 50 == 0:
                print(f"   Copied {copied} images...")
        except Exception as e:
            print(f"❌ Error copying {image_id}: {e}")
            missing += 1
    
    print(f"\n✅ Done!")
    print(f"   Successfully copied: {copied} images")
    print(f"   Missing/failed: {missing} images")
    print(f"   Output directory: {output_dir}")
    
    if copied > 0:
        print(f"\n📋 Next step:")
        print(f"   python scripts/import_research_flags.py {csv_path}")

if __name__ == "__main__":
    main()