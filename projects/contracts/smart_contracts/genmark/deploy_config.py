"""
GenMark Deploy Configuration
=============================
Deployment script for the GenMark smart contract on Algorand TestNet.

Usage:
    algokit project deploy testnet

After successful deployment:
    1. Copy the printed App ID to your backend .env file as ALGORAND_APP_ID
    2. The contract is funded with 10 ALGO to cover initial box storage costs
"""

import logging

import algokit_utils

logger = logging.getLogger(__name__)


def deploy() -> None:
    """Deploy or update the GenMark contract on the configured network."""
    from smart_contracts.artifacts.genmark.genmark_client import GenMarkFactory

    algorand = algokit_utils.AlgorandClient.from_environment()
    deployer_ = algorand.account.from_environment("DEPLOYER")

    factory = algorand.client.get_typed_app_factory(
        GenMarkFactory, default_sender=deployer_.address
    )

    # Deploy using idempotent strategy:
    # - If no app exists: creates it
    # - If schema changed: appends a new app (safe upgrade)
    # - If logic changed but schema unchanged: updates in place
    app_client, result = factory.deploy(
        on_update=algokit_utils.OnUpdate.AppendApp,
        on_schema_break=algokit_utils.OnSchemaBreak.AppendApp,
    )

    if result.operation_performed in [
        algokit_utils.OperationPerformed.Create,
        algokit_utils.OperationPerformed.Replace,
    ]:
        # Fund the contract with 10 ALGO to cover box Minimum Balance Requirements.
        # Box MBR formula: 2500 + 400 * (key_size + value_size) microAlgos per box.
        # 10 ALGO supports ~80 registrations before needing a top-up.
        algorand.send.payment(
            algokit_utils.PaymentParams(
                amount=algokit_utils.AlgoAmount(algo=10),
                sender=deployer_.address,
                receiver=app_client.app_address,
            )
        )
        logger.info(
            f"Deployed GenMark app {app_client.app_id} "
            f"at address {app_client.app_address}"
        )
        # Print the App ID prominently so it can be copied to the backend .env
        print("\n" + "=" * 60)
        print("DEPLOYMENT SUCCESSFUL — Copy this to your backend .env:")
        print(f"  ALGORAND_APP_ID={app_client.app_id}")
        print("=" * 60 + "\n")
    else:
        logger.info(
            f"GenMark app already up-to-date: App ID {app_client.app_id}"
        )
