/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', 'N/format'],
    /**
     * @param {record} record
     * @param {search} search
     */
    function (record, search, runtime, format) {

        function doPost(requestBody) {
            var retVal={
                status: "",
            }
            var title = "create SO doPost";
            log.debug(title, '--------****Starts***--------');
            var restletDataVal =requestBody;
            try {
                // fetch Header Values
                var soHeader = {};
                soHeader.externalid = restletDataVal.externalid;
                soHeader.date = restletDataVal.date;

                // fetch and Set Customer Details
                var customerId = '';
                var addressInternalId = '';
                var custNm = restletDataVal.customer
                var custDetails = getCustomerId(custNm);
                if (!isEmpty(custDetails.id)) {
                    customerId = custDetails.id;
                    var custAddressJson = custDetails.adressDtl;
                    addressInternalId = custAddressJson[restletDataVal.billto.sfdcid];
                    if (isEmpty(addressInternalId)) {
                        log.debug('create Address');
                        // check if externalid  available
                        addressInternalId = createCustomerAddress(customerId, restletDataVal.billto);
                    }
                } else {
                    // customerId=createCustomerRecord(restletDataVal.customer,restletDataVal.billto);
                    throw "Customer not available"

                }
                soHeader.customerId = custNm;
                soHeader.addressInternalId = addressInternalId;
                // Create SO
                var soId;
                soId = createSORecord(soHeader, restletDataVal.lines);

                retVal.status = 'success'
                retVal.order_id = soId

            } catch (e) {
                log.error(title + 'EXCEPTION', JSON.stringify(e));
                retVal.status = 'error'
                retVal.error = e.message;
            }





            return retVal;
        }

        function getCustomerId(custNm) {
            log.debug('customer custNm', custNm);
            var cutomerDetail = {};
            cutomerDetail.adressDtl = {};
            var customerSearchObj1 = search.create({
                type: "customer",
                filters:
                    [
                        ["entityid","is",custNm]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "entityid",
                            sort: search.Sort.ASC,
                            label: "ID"
                        }),
                        search.createColumn({ name: "internalid", label: "Internal Id" })

                    ]
            });
            var custId;
            var searchResultCount1 = customerSearchObj1.runPaged().count;
            log.debug("customerSearchObj result count", searchResultCount1);
            customerSearchObj1.run().each(function (result) {
                custId = result.getValue('internalid');
                cutomerDetail.id = result.getValue('internalid');
                return true;
            });

            if (!isEmpty(custId)) {

                var customerSearchObj = search.create({
                    type: "customer",
                    filters:
                        [
                            ["entityid","is",custNm]
                        ],
                    columns:
                        [
                            search.createColumn({
                                name: "entityid",
                                sort: search.Sort.ASC,
                                label: "ID"
                            }),
                            search.createColumn({ name: "internalid", label: "Internal Id" }),
                            search.createColumn({ name: "altname", label: "Name" }),
                            search.createColumn({ name: "email", label: "Email" }),
                            search.createColumn({ name: "phone", label: "Phone" }),
                            search.createColumn({ name: "altphone", label: "Office Phone" }),
                            search.createColumn({ name: "fax", label: "Fax" }),
                            search.createColumn({ name: "contact", label: "Primary Contact" }),
                            search.createColumn({ name: "altemail", label: "Alt. Email" }),
                            search.createColumn({ name: "firstname", label: "First Name" }),
                            search.createColumn({ name: "lastname", label: "Last Name" }),
                            search.createColumn({
                                name: "custrecord_np_sfdc_id",
                                join: "Address",
                                label: "SFDC ID"
                            }),
                            search.createColumn({
                                name: "addressinternalid",
                                join: "Address",
                                label: "Address Internal ID"
                            })
                        ]
                });
                var searchResultCount = customerSearchObj.runPaged().count;
                log.debug("customerSearchObj result count", searchResultCount);
                customerSearchObj.run().each(function (result) {
                    cutomerDetail.id = result.getValue('internalid');

                    var addressSFDCID = result.getValue({
                        name: "custrecord_np_sfdc_id",
                        join: "Address",
                        label: "SFDC ID"
                    });
                    var addressInternalId = result.getValue({
                        name: "addressinternalid",
                        join: "Address",
                        label: "Address Internal ID"
                    });
                    cutomerDetail.adressDtl[addressSFDCID] = addressInternalId;

                    return true;
                });
                log.debug('value of Customer JSON', JSON.stringify(cutomerDetail));
            }
            return cutomerDetail;
        }
        function createSORecord(soHeader, soLines) {
            log.debug('soHeader', JSON.stringify(soHeader));
            var soRec = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });
            soRec.setText('entity', soHeader.customerId);
            soRec.setText('externalid', soHeader.externalid);
            log.debug('soHeader.date', soHeader.date)
            var date = format.parse({
                value: soHeader.date,
                type: format.Type.DATE
            });
            soRec.setValue('trandate', date);

            soRec.setValue('shipaddresslist', '');
            if (!isEmpty(soHeader.addressInternalId)) {
                soRec.setValue('billaddresslist', soHeader.addressInternalId);
            }

            for (var i = 0; i < soLines.length; i++) {

                var itemline = soRec.selectNewLine({
                    sublistId: 'item'
                });
                itemline.setCurrentSublistText({
                    sublistId: 'item',
                    fieldId: 'item',
                    text: soLines[i].item,
                });
                itemline.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: soLines[i].quantity,
                });
                itemline.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'rate',
                    value: soLines[i].price,
                });



                itemline.commitLine({
                    sublistId: 'item'
                });
            }
            var internalId = soRec.save();

            log.debug('value of SO REC ', internalId);

            return internalId;
        }



        function createCustomerRecord(customerDetails, billtoDetails) {
            var customerRecord = record.create({
                type: record.Type.CUSTOMER,
                isDynamic: true,
                defaultValues: {

                    subsidiary: 2
                }
            });
            customerRecord.setValue(
                {
                    fieldId: 'isperson',
                    value: 'F',
                    ignoreFieldChange: false
                }
            );
            customerRecord.setValue('firstname', customerDetails.fname);
            customerRecord.setValue('lastname', customerDetails.lname);
            customerRecord.setValue('email', customerDetails.email);
            customerRecord.setValue('custentity_uc_customer_externalid', customerDetails.externalid);
            customerRecord.setValue('externalid', customerDetails.externalid);
            customerRecord.setValue('companyname', 'Test Postman');


            // setting new Address

            customerRecord.selectNewLine({
                sublistId: 'addressbook'
            });


            var myAddressSubRecord = customerRecord.getCurrentSublistSubrecord({
                sublistId: 'addressbook',
                fieldId: 'addressbookaddress'
            })
            myAddressSubRecord.setText({
                fieldId: 'country',
                value: "United States"
            })
            if (!isEmpty(billtoDetails.addressee)) {
                myAddressSubRecord.setValue({
                    fieldId: 'addressee',
                    value: billtoDetails.addressee
                })
            }
            myAddressSubRecord.setValue({
                fieldId: 'addr1',
                value: billtoDetails.addr1
            })


            myAddressSubRecord.setValue({
                fieldId: 'addr2',
                value: billtoDetails.addr2
            })
            myAddressSubRecord.setValue({
                fieldId: 'addrphone',
                value: billtoDetails.phone
            })
            myAddressSubRecord.setValue({
                fieldId: 'city',
                value: billtoDetails.city
            })

            myAddressSubRecord.setValue({
                fieldId: 'state',
                value: billtoDetails.state
            })

            myAddressSubRecord.setValue({
                fieldId: 'zip',
                value: billtoDetails.zip
            })

            myAddressSubRecord.setValue({
                fieldId: 'custrecord_address_externalid',
                value: billtoDetails.externalid
            })
            customerRecord.commitLine({
                sublistId: 'addressbook'
            })

            var customerID = customerRecord.save();

            log.debug('value customerID created ', customerID);

            return customerID;


        }

        function createCustomerAddress(customerId, billtoDetails) {
            var customerRecord = record.load({
                type: 'customer',
                isDynamic: true,
                id: customerId
            });
            customerRecord.selectNewLine({
                sublistId: 'addressbook'
            });


            var myAddressSubRecord = customerRecord.getCurrentSublistSubrecord({
                sublistId: 'addressbook',
                fieldId: 'addressbookaddress'
            })

            myAddressSubRecord.setText({
                fieldId: 'country',
                value: "United States"
            })
            if (!isEmpty(billtoDetails.addressee)) {
                myAddressSubRecord.setValue({
                    fieldId: 'addressee',
                    value: billtoDetails.addressee
                })
            }

            myAddressSubRecord.setValue({
                fieldId: 'addr1',
                value: billtoDetails.addr1
            })



            myAddressSubRecord.setValue({
                fieldId: 'addr2',
                value: billtoDetails.addr2
            })
            myAddressSubRecord.setValue({
                fieldId: 'addrphone',
                value: billtoDetails.phone
            })
            myAddressSubRecord.setValue({
                fieldId: 'city',
                value: billtoDetails.city
            })

            myAddressSubRecord.setValue({
                fieldId: 'state',
                value: billtoDetails.state
            })

            myAddressSubRecord.setValue({
                fieldId: 'zip',
                value: billtoDetails.zip
            })

            log.debug(' myAddressSubRecord', JSON.stringify(myAddressSubRecord));
            myAddressSubRecord.setValue({
                fieldId: 'custrecord_np_sfdc_id',
                value: billtoDetails.sfdcid
            })
            customerRecord.setCurrentSublistValue({
                sublistId: 'addressbook',
                fieldId: 'defaultbilling',
                value: true
            })

            var addressId = customerRecord.commitLine({
                sublistId: 'addressbook'
            })

            var custId = customerRecord.save();

        }

        function isEmpty(stValue) {
            if ((stValue == '') || (stValue == null) || (stValue == undefined) || (stValue == 'null')) {
                return true;
            }
            return false;

        }


        return {

            post: doPost
        };

    });